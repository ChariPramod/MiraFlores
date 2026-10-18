import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { executeCommand, loadProjection } from '@/lib/events/service';
import type { Command } from '@/lib/events/commands';
import { MemoryEventStore } from '@/lib/persistence/memory-store';
import { FileEventStore } from '@/lib/persistence/file-store';
import { activePersonas, persona } from '@/lib/security/policy';
import { redact, maskText } from '@/lib/security/redaction';
import { signCapability, verifyCapability, validWorkspaceId } from '@/lib/security/tokens';
import { collaborationView } from '@/lib/workspace/collaboration';
import { renderDocumentPage } from '@/lib/documents/renderer';
import { getPacket } from '@/lib/packet/load';
import { projectClaim } from '@/lib/packet/projections';

function harness(store = new MemoryEventStore()) {
  const workspaceId = `ws_test_${randomUUID()}`;
  const send = (actorId:string, command:object, asOf?:string) => executeCommand({command:{workspaceId,branchId:'main',idempotencyKey:randomUUID(),...command} as Command,actorId,sessionWorkspaceId:workspaceId,store,asOf});
  return { store,workspaceId,send };
}
const adjustment = { type:'record_adjustment',claimKey:'F8949.B.N1',engineVersion:'v3',field:'basis',effectiveValue:19100,category:'basis_correction',effectMethod:'stcg',evidenceRefs:['ev-0066'],reason:'Supported by supplemental statement',expectedRevision:0 };

describe('Day 4 authorization',()=>{
  it.each(['cu-01','cu-02','st-05','st-06','invented'])('rejects tax mutations by %s',async actor=>{
    const h=harness();
    const result=await h.send(actor,adjustment);
    expect(result.ok).toBe(false);
    expect(await h.store.listEvents(h.workspaceId,'main')).toEqual([]);
  });
  it('enforces role level and prohibits self-review, including dependent totals',async()=>{
    const h=harness();
    expect((await h.send('st-02',adjustment)).ok).toBe(true);
    for (const claimKey of ['F8949.B.N1','F1040.7']) {
      expect((await h.send('st-02',{type:'record_signoff',claimKey,engineVersion:'v3',level:'reviewer',expectedRevision:claimKey==='F1040.7'?0:1})).ok).toBe(false);
    }
    expect((await h.send('st-01',{type:'record_signoff',claimKey:'F8949.B.N1',engineVersion:'v3',level:'partner',expectedRevision:1})).ok).toBe(false);
    expect((await h.send('st-03',{type:'record_signoff',claimKey:'F8949.B.N1',engineVersion:'v3',level:'partner',expectedRevision:1})).ok).toBe(true);
  });
  it('requires partner approval for large effects after reviewer sign-off',async()=>{
    const h=harness();await h.send('st-01',adjustment);
    await h.send('st-02',{type:'record_signoff',claimKey:'F8949.B.N1',engineVersion:'v3',level:'reviewer',expectedRevision:1});
    let p=await loadProjection(h.workspaceId,'main',h.store);
    expect(projectClaim('F8949.B.N1','v3',undefined,p)?.working).toMatchObject({partnerApprovalRequired:true,partnerApprovalSatisfied:false});
    await h.send('st-03',{type:'record_signoff',claimKey:'F8949.B.N1',engineVersion:'v3',level:'partner',expectedRevision:2});
    p=await loadProjection(h.workspaceId,'main',h.store);
    expect(projectClaim('F8949.B.N1','v3',undefined,p)?.working?.partnerApprovalSatisfied).toBe(true);
  });
  it('gates persona activation and assignees by simulation date',async()=>{
    expect(persona('st-04','2026-03-01')).toBeNull();
    expect(activePersonas().some(p=>p.id==='st-06')).toBe(false);
    expect(persona('st-06','2027-01-04')?.role).toBe('quality_reviewer');
    const h=harness();
    expect((await h.send('st-05',{type:'bulk_assign',assigneeId:'st-06',scopeKeys:['v3::F1040.7'],reason:'Invalid future assignment'})).ok).toBe(false);
  });
  it('rejects unknown or future evidence and invalid verification claims',async()=>{
    const h=harness();
    for (const ref of ['not-real','qa-999','D71','answer:foreign']) expect((await h.send('st-01',{...adjustment,evidenceRefs:[ref]})).ok).toBe(false);
    expect((await h.send('st-01',{type:'record_verification',claimKey:'nope',engineVersion:'v3',method:'other',conclusion:'verified',expectedRevision:0})).ok).toBe(false);
  });
  it('prevents uncleared staff from verifying restricted evidence',async()=>{
    const h=harness();
    expect((await h.send('st-04',{...adjustment,evidenceRefs:['D03']})).ok).toBe(false);
    expect((await h.send('st-04',adjustment)).ok).toBe(true);
  });
});

describe('Day 4 private sessions and redaction',()=>{
  it('rejects tampered, expired, wrong-kind and path traversal capabilities',()=>{
    const payload={kind:'session' as const,workspaceId:`ws_${randomUUID()}`,personaId:'st-04',locked:true,expires:Date.now()+60000};
    const token=signCapability(payload);
    expect(verifyCapability(token,'session')).toEqual(payload);
    expect(verifyCapability(token,'invite')).toBeNull();
    expect(verifyCapability(token.slice(0,-5)+'aaaaa','session')).toBeNull();
    expect(verifyCapability(signCapability({...payload,expires:0}),'session')).toBeNull();
    expect(validWorkspaceId('ws_/../../outside')).toBe(false);
    expect(verifyCapability(signCapability({...payload,workspaceId:'ws_/../../outside'}),'session')).toBeNull();
  });
  it('removes full identifiers from all rendered document DTOs, including extracted values and anchors',()=>{
    const packet=getPacket();
    const forbidden=[...packet.household.people.map(p=>String(p.ssn)),String(packet.household.people[0].ip_pin),'990000017','4483019276'];
    for(const doc of packet.documents) for(const page of doc.pages) {
      const rendered=renderDocumentPage(doc.id,page.page);
      const json=JSON.stringify(redact(rendered,'st-04'));
      for(const value of forbidden) expect(json).not.toContain(value);
    }
    const d03=renderDocumentPage('D03',1,'ev-0005');
    expect(JSON.stringify(redact(d03,'st-01'))).toBe(JSON.stringify(d03));
    expect(maskText('Free note SSN 123-45-6789; account 9876543210; IP PIN 123456')).not.toMatch(/123-45-6789|9876543210|123456/);
  });
  it('binds client answers to the question recipient and isolates internal notes/uploads',async()=>{
    const h=harness();
    const q=await h.send('st-01',{type:'ask_question',clientId:'cu-01',claimKey:'F8949.B.N1',text:'Please confirm the basis statement.'});
    expect(q.ok).toBe(true); if(!q.ok)return;
    const questionId=q.events[0].id;
    expect((await h.send('cu-02',{type:'record_answer',questionId,text:'Wrong person'})).ok).toBe(false);
    expect((await h.send('cu-01',{type:'record_answer',questionId,text:'Confirmed',attachment:{name:'secret.txt',text:'Account 4483019276'}})).ok).toBe(true);
    await h.send('st-01',{type:'record_note',text:'Internal-only note',visibility:'internal',blocking:true});
    const events=await h.store.listEvents(h.workspaceId,'main');
    const client=collaborationView(events,'cu-01');
    expect(client.questions[0].answers).toHaveLength(1);
    expect(JSON.stringify(client)).not.toContain('Internal-only');
    expect(collaborationView(events,'cu-02').questions).toHaveLength(0);
    const unprivileged=collaborationView(events,'st-04');
    expect(JSON.stringify(unprivileged)).not.toContain('secret.txt');
    expect(JSON.stringify(unprivileged)).not.toContain('4483019276');
    expect((await h.send('cu-01',{type:'resolve_question',questionId,resolution:'Client cannot close'})).ok).toBe(false);
    expect((await h.send('st-02',{type:'resolve_question',questionId,resolution:'Evidence reviewed'})).ok).toBe(true);
    expect((await h.send('cu-01',{type:'record_answer',questionId,text:'Too late'})).ok).toBe(false);
  });
  it('persists questions across new file-store instances and isolates other workspaces',async()=>{
    const store=new FileEventStore(); const workspaceId=`ws_test_${randomUUID()}`;
    try {
      await executeCommand({command:{type:'ask_question',workspaceId,branchId:'main',clientId:'cu-01',text:'Durable question',idempotencyKey:randomUUID()},actorId:'st-01',sessionWorkspaceId:workspaceId,store});
      const fresh=new FileEventStore();
      expect((await fresh.listEvents(workspaceId,'main'))[0].type).toBe('question_created');
      expect(await fresh.listEvents(`ws_test_${randomUUID()}`,'main')).toEqual([]);
    } finally { await store.deleteWorkspace(workspaceId); }
  });
});

describe('Approval dependency changes',()=>{
  it('reopens approval when supplemental evidence disposition changes',async()=>{
    const h=harness();await h.send('st-01',adjustment);
    await h.send('st-03',{type:'record_signoff',claimKey:'F8949.B.N1',engineVersion:'v3',level:'partner',expectedRevision:1});
    await h.send('st-02',{type:'record_disposition',documentId:'D11',disposition:'pending',explanation:'Recheck supporting statement'});
    const p=await loadProjection(h.workspaceId,'main',h.store);
    expect(projectClaim('F8949.B.N1','v3',undefined,p)?.working?.signoffStatus).toBe('reopened');
  });
});
