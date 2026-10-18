import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { executeCommand, loadProjection } from '@/lib/events/service';
import { MemoryEventStore } from '@/lib/persistence/memory-store';
import { FileEventStore } from '@/lib/persistence/file-store';
import type { EventStore } from '@/lib/persistence/store';
import { clientFilingState, executeFilingCommand, hashSnapshotSummary, loadFilingState, verifyFrozenSnapshot } from '@/lib/filing/service';
import type { FilingCommand, FrozenSnapshot } from '@/lib/filing/types';

const key=()=>randomUUID();
function workspace(store:EventStore=new MemoryEventStore()) {
  const workspaceId=`ws_${randomUUID()}`;
  const ctx={workspaceId,store};
  async function run(command:Omit<FilingCommand,'workspaceId'|'branchId'|'expectedSequence'|'idempotencyKey'> & Record<string,unknown>, actorId='st-01', branchId='main') {
    const state=await loadFilingState({...ctx,branchId});
    return executeFilingCommand({command:{...command,workspaceId,branchId,expectedSequence:state.sequence,idempotencyKey:key()} as FilingCommand, actorId,sessionWorkspaceId:workspaceId,store});
  }
  async function adjust(value=19100,branchId='main',actorId='st-01') {
    const projection=await loadProjection(workspaceId,branchId,store);
    return executeCommand({command:{type:'record_adjustment',workspaceId,branchId,claimKey:'F8949.B.N1',engineVersion:'v3',field:'basis',effectiveValue:value,category:'basis_correction',effectMethod:'stcg',evidenceRefs:['ev-0066','D11'],reason:'Agree to D11 supplemental stock plan statement',expectedRevision:projection.claimRevisions['F8949.B.N1']??0,idempotencyKey:key()},actorId,sessionWorkspaceId:workspaceId,store});
  }
  async function verify(branchId='main',actorId='st-01') {
    const projection=await loadProjection(workspaceId,branchId,store);
    return executeCommand({command:{type:'record_verification',workspaceId,branchId,claimKey:'F8949.B.N1',engineVersion:'v3',method:'agree_to_supplemental',conclusion:'verified',evidenceRefs:['ev-0066','D11'],expectedRevision:projection.claimRevisions['F8949.B.N1']??0,idempotencyKey:key()},actorId,sessionWorkspaceId:workspaceId,store});
  }
  async function prepare(scope:'prepared_demo'|'full_return'='prepared_demo') {
    expect((await adjust()).ok).toBe(true);
    expect((await verify()).ok).toBe(true);
    const frozen=await run({type:'freeze_package',scope});
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) throw new Error(frozen.message);
    return frozen.state.snapshots.at(-1)!;
  }
  async function approve(snapshot:FrozenSnapshot) {
    for (const [actorId,level] of [['st-02','reviewer'],['st-03','partner'],['cu-01','client']] as const) {
      const result=await run({type:'approve_package',snapshotId:snapshot.id,level,presentedSummaryHash:hashSnapshotSummary(snapshot)},actorId);
      expect(result.ok,result.ok?'':result.message).toBe(true);
    }
  }
  return {...ctx,run,adjust,verify,prepare,approve};
}

describe('Day 5 immutable filing and amendment lifecycle',()=>{
  it('freezes review packages without claiming full return readiness; approval is exact-content',async()=>{
    const w=workspace(); const snapshot=await w.prepare('full_return');
    await w.approve(snapshot);
    const state=await loadFilingState(w);
    expect(state.readiness[snapshot.id].ready).toBe(false);
    expect(state.readiness[snapshot.id].blockers.join(' ')).toMatch(/not implemented|unresolved/);
    const submit=await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'federal',simulatedResult:'accepted',reason:'Attempt full return demo'},'st-03');
    expect(submit).toMatchObject({ok:false,code:'not_ready'});
    expect(verifyFrozenSnapshot(snapshot,await w.store.listEvents(w.workspaceId,'main'))).toBe(true);
  });
  it('requires verified N1 provenance and partner approval; clients cannot edit or freeze',async()=>{
    const w=workspace(); await w.adjust();
    const frozen=await w.run({type:'freeze_package',scope:'prepared_demo'});
    if (!frozen.ok) throw new Error(frozen.message);
    const snapshot=frozen.state.snapshots[0];
    expect(frozen.state.readiness[snapshot.id].blockers.join(' ')).toMatch(/verified conclusion/);
    expect(frozen.state.readiness[snapshot.id].partnerRequired).toBe(true);
    expect(await w.run({type:'freeze_package',scope:'prepared_demo'},'cu-01')).toMatchObject({ok:false,code:'forbidden'});
    expect(await w.adjust(19100,'main','cu-01')).toMatchObject({ok:false,code:'forbidden'});
    expect(await w.run({type:'approve_package',snapshotId:snapshot.id,level:'client',presentedSummaryHash:'not-the-presented-summary'},'cu-01')).toMatchObject({ok:false,code:'stale'});
    const client=clientFilingState(frozen.state);
    expect(JSON.stringify(client)).not.toContain('documentHashes');
    expect(client.packages[0].summary.simulationOnly).toBe(true);
  });
  it('blocks open review notes even if package approvals are present, and permits resolution without fabricating new approvals',async()=>{
    const w=workspace(); const snapshot=await w.prepare(); await w.approve(snapshot);
    const note=await executeCommand({command:{type:'record_note',workspaceId:w.workspaceId,branchId:'main',text:'Review this before simulation',visibility:'internal',blocking:false,idempotencyKey:key()},actorId:'st-02',sessionWorkspaceId:w.workspaceId,store:w.store});
    if (!note.ok) throw new Error(note.message);
    const blocked=await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'federal',simulatedResult:'accepted',reason:'Check open note gate'},'st-03');
    expect(blocked).toMatchObject({ok:false,code:'not_ready'});
    if (!blocked.ok) expect(blocked.blockers?.join(' ')).toMatch(/open review note/);
    const noteId=note.projection.notes[0].noteId;
    expect((await executeCommand({command:{type:'resolve_note',workspaceId:w.workspaceId,branchId:'main',noteId,resolution:'Resolved by examining printed support',idempotencyKey:key()},actorId:'st-02',sessionWorkspaceId:w.workspaceId,store:w.store})).ok).toBe(true);
    const state=await loadFilingState(w);
    expect(state.readiness[snapshot.id].ready).toBe(true);
  });
  it('invalidates client approval after material editing and preserves the old package unchanged',async()=>{
    const w=workspace(); const snapshot=await w.prepare(); await w.approve(snapshot);
    const frozenBytes=JSON.stringify(snapshot);
    await w.adjust(18000);
    const state=await loadFilingState(w);
    expect(state.readiness[snapshot.id].current).toBe(false);
    expect(state.approvals).toHaveLength(3);
    expect(JSON.stringify(state.snapshots[0])).toBe(frozenBytes);
    expect(await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'federal',simulatedResult:'accepted',reason:'Stale client package attempt'},'st-03')).toMatchObject({ok:false,code:'stale'});
    const refreshed=await w.run({type:'freeze_package',scope:'prepared_demo'});
    if (!refreshed.ok) throw new Error(refreshed.message);
    const newest=refreshed.state.snapshots.at(-1)!;
    expect(refreshed.state.readiness[newest.id].blockers.join(' ')).toMatch(/Client approval/);
    expect(verifyFrozenSnapshot(snapshot,await w.store.listEvents(w.workspaceId,'main'))).toBe(true);
  });
  it('pins federal acceptance separately and preserves accepted bytes through an isolated amendment',async()=>{
    const w=workspace(); const snapshot=await w.prepare(); await w.approve(snapshot);
    const bytes=JSON.stringify(snapshot);
    const accepted=await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'federal',simulatedResult:'accepted',reason:'Explicit N1 lifecycle simulation'},'st-03');
    if (!accepted.ok) throw new Error(accepted.message);
    expect(accepted.state.jurisdictionStatus).toEqual({federal:'accepted',california:'not_submitted'});
    expect(await w.adjust(18000)).toMatchObject({ok:false,code:'validation'});
    const amendment=await w.run({type:'create_amendment',snapshotId:snapshot.id,reason:'Demonstrate isolated amended working branch'});
    if (!amendment.ok || !amendment.branchId) throw new Error('Expected amendment');
    const inherited=await loadProjection(w.workspaceId,amendment.branchId,w.store);
    expect(inherited.adjustments['v3::F8949.B.N1'].effectiveValue).toBe(19100);
    expect((await w.adjust(18000,amendment.branchId)).ok).toBe(true);
    expect((await loadProjection(w.workspaceId,'main',w.store)).adjustments['v3::F8949.B.N1'].effectiveValue).toBe(19100);
    const after=await loadFilingState(w);
    expect(JSON.stringify(after.snapshots[0])).toBe(bytes);
    expect(after.attempts[0].status).toBe('accepted');
    const child=await loadFilingState({...w,branchId:amendment.branchId});
    expect(child.approvals).toEqual([]); expect(child.snapshots).toEqual([]); expect(child.frozen).toBe(false);
  });
  it('retains rejected attempts and opens a successor from the rejected frozen content',async()=>{
    const w=workspace(); const snapshot=await w.prepare(); await w.approve(snapshot);
    const rejected=await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'california',simulatedResult:'rejected',reason:'Scripted transport rejection demonstration'},'st-03');
    expect(rejected.ok).toBe(true);
    expect(await w.run({type:'create_amendment',snapshotId:snapshot.id,reason:'No acceptance exists'})).toMatchObject({ok:false,code:'validation'});
    const successor=await w.run({type:'create_successor',snapshotId:snapshot.id,reason:'Correct rejection in successor draft'});
    if (!successor.ok || !successor.branchId) throw new Error('Expected successor');
    expect((await w.store.getBranch(w.workspaceId,successor.branchId))?.mode).toBe('successor');
    expect((await loadFilingState(w)).attempts[0].status).toBe('rejected');
    expect((await loadFilingState({...w,branchId:successor.branchId})).approvals).toEqual([]);
  });
  it('rejects workspace crossing, stale writes, self-review and tampered frozen content',async()=>{
    const w=workspace(); const snapshot=await w.prepare();
    const command:FilingCommand={type:'freeze_package',scope:'prepared_demo',workspaceId:w.workspaceId,branchId:'main',expectedSequence:0,idempotencyKey:key()};
    expect(await executeFilingCommand({command,actorId:'st-01',sessionWorkspaceId:`ws_${randomUUID()}`,store:w.store})).toMatchObject({ok:false,code:'isolation'});
    expect(await executeFilingCommand({command,actorId:'st-01',sessionWorkspaceId:w.workspaceId,store:w.store})).toMatchObject({ok:false,code:'stale'});
    const edited=structuredClone(snapshot); edited.summary.n1.workingGain=999;
    expect(verifyFrozenSnapshot(edited,await w.store.listEvents(w.workspaceId,'main'))).toBe(false);
    await w.adjust(19100,'main','st-02'); await w.verify();
    const next=await w.run({type:'freeze_package',scope:'prepared_demo'});
    if (!next.ok) throw new Error(next.message);
    const own=next.state.snapshots.at(-1)!;
    expect(await w.run({type:'approve_package',snapshotId:own.id,level:'reviewer',presentedSummaryHash:hashSnapshotSummary(own)},'st-02')).toMatchObject({ok:false,code:'forbidden'});
  });
  it('deduplicates retries before stale sequence checks',async()=>{
    const w=workspace(); await w.adjust(); await w.verify();
    const state=await loadFilingState(w);
    const command:FilingCommand={type:'freeze_package',scope:'prepared_demo',workspaceId:w.workspaceId,branchId:'main',expectedSequence:state.sequence,idempotencyKey:key()};
    const options={command,actorId:'st-01',sessionWorkspaceId:w.workspaceId,store:w.store};
    const first=await executeFilingCommand(options), retry=await executeFilingCommand(options);
    expect(first.ok).toBe(true); expect(retry).toMatchObject({ok:true,deduped:true});
    expect((await loadFilingState(w)).snapshots).toHaveLength(1);
  });
  it('persists frozen records and inherited branches across file-store instances',async()=>{
    const w=workspace(new FileEventStore());
    try {
      const snapshot=await w.prepare(); await w.approve(snapshot);
      const accepted=await w.run({type:'submit_filing',snapshotId:snapshot.id,jurisdiction:'federal',simulatedResult:'accepted',reason:'File persistence lifecycle demo'},'st-03');
      expect(accepted.ok).toBe(true);
      const amendment=await w.run({type:'create_amendment',snapshotId:snapshot.id,reason:'File persistence amendment demo'});
      if (!amendment.ok || !amendment.branchId) throw new Error('Expected amendment');
      const fresh=new FileEventStore();
      const reloaded=await loadFilingState({...w,store:fresh});
      expect(reloaded.snapshots[0].contentHash).toBe(snapshot.contentHash);
      expect(reloaded.attempts[0].status).toBe('accepted');
      expect((await loadProjection(w.workspaceId,amendment.branchId,fresh)).adjustments['v3::F8949.B.N1'].workingGain).toBe(140);
    } finally { await w.store.deleteWorkspace?.(w.workspaceId); }
  });
});
