import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { collectFindings } from '@/lib/checks/run';
import { verificationFingerprint } from '@/lib/events/fingerprint';
import { reduceEvents } from '@/lib/events/reducer';
import { POLICY_VERSION, type StoredEvent, type WorkspaceProjection } from '@/lib/events/types';
import { getLine } from '@/lib/packet/indexes';
import { getPacket, loadPacket } from '@/lib/packet/load';
import { documentAvailableAt, DEFAULT_AS_OF } from '@/lib/packet/availability';
import { getEventStore } from '@/lib/persistence/get-store';
import type { EventStore } from '@/lib/persistence/store';
import { persona } from '@/lib/security/policy';
import { validWorkspaceId } from '@/lib/security/tokens';
import { FilingCommandSchema, type FilingCommand, type FilingReadiness, type FilingScope, type FilingState, type FrozenSnapshot } from './types';

function canonical(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function sha256(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function hashSnapshotSummary(snapshot: FrozenSnapshot): string { return sha256(snapshot.summary); }

type Context = { workspaceId: string; branchId?: string; version?: string; asOf?: string; store?: EventStore };
const materialKinds = new Set(['adjustment_recorded','verification_recorded','document_disposition_recorded','answer_recorded']);
function materialEvents(history: StoredEvent[]) {
  return history.filter(event => { const payload=event.payload; return materialKinds.has(event.type) || (payload.kind === 'event_reversed' && materialKinds.has(history.find(original => original.id === payload.originalEventId)?.type ?? '')); });
}
function contextContent(history: StoredEvent[], projection: WorkspaceProjection, version: string, asOf: string, scope: FilingScope) {
  const adjustments = Object.values(projection.adjustments).filter(a => !a.reversed && a.engineVersion === version).sort((a,b) => a.claimKey.localeCompare(b.claimKey));
  const n1 = adjustments.find(a => a.claimKey === 'F8949.B.N1' && a.field === 'basis');
  const engineGain = getLine('F8949.B.N1', version)?.value;
  const summary: FrozenSnapshot['summary'] = {
    title: scope === 'prepared_demo' ? 'Prepared N1 lifecycle demonstration — not a filed tax return' : 'Full return review package — incomplete tax work',
    simulationOnly:true, fullyRecomputed:false, engineVersion:version, scope,
    n1:{ engineBasis:0, engineGain:typeof engineGain === 'number' ? engineGain : 0, workingBasis:n1?.effectiveValue ?? null, workingGain:n1?.workingGain ?? null, evidenceRefs:n1?.evidenceRefs ?? [] },
    adjustments:adjustments.map(a => ({ claimKey:a.claimKey,field:a.field,originalValue:a.originalValue,effectiveValue:a.effectiveValue,workingGain:a.workingGain,federalEstimate:a.estimatedFederalEffect,californiaEstimate:a.estimatedCaliforniaEffect })),
    limitations:[
      'Simulation only. No return has been transmitted to a tax agency.',
      'Working adjustments and supplied-rate estimates do not constitute a fully recomputed return.',
      ...(scope === 'prepared_demo' ? ['Readiness covers the N1 demonstration only. Broader packet findings and unfinished tax work remain unresolved; this is not full-return approval or filing readiness.'] : ['Broader checks, California AMT, outside basis, due diligence and outside-filing dispositions remain unresolved.']),
    ],
  };
  const documents = getPacket().documents.filter(d => documentAvailableAt(d, asOf));
  const documentHashes = documents.map(d => ({ id:d.id,sha256:sha256(d),pages:d.pages.map(p => p.page) }));
  const state = { adjustments:projection.adjustments, dispositions:projection.dispositions, verifications:projection.verifications };
  const stateHash = sha256(state);
  const evidenceRefs = [...new Set(adjustments.flatMap(a => a.evidenceRefs))].sort();
  const attachmentHashes = history.flatMap(e => e.payload.kind === 'answer_recorded' && e.payload.attachment ? [{eventId:e.id,sha256:sha256(e.payload.attachment),classification:'restricted' as const}]:[]);
  const contentHash = sha256({ packetHash:loadPacket().sha256, policyVersion:POLICY_VERSION,version,asOf,scope,summary,stateHash,materialEventIds:materialEvents(history).map(e => e.id),documentHashes,attachmentHashes });
  return { summary,stateHash,documentHashes,evidenceRefs,attachmentHashes,contentHash };
}

function readiness(snapshot: FrozenSnapshot, state: FilingState, history: StoredEvent[], projection: WorkspaceProjection, version: string, asOf: string): FilingReadiness {
  const current = snapshot.engineVersion === version && snapshot.asOf === asOf && contextContent(history, projection, version, asOf, snapshot.scope).contentHash === snapshot.contentHash;
  const blockers: string[] = [];
  if (!current) blockers.push('Package content changed. Freeze a new package and obtain fresh approvals.');
  const openNotes = projection.notes.filter(n => !n.resolved);
  if (openNotes.length) blockers.push(`${openNotes.length} open review note(s) must be resolved.`);
  const findings = collectFindings({version,asOf}).filter(f => f.status === 'fail' || f.status === 'needs_review');
  if (snapshot.scope === 'full_return') {
    if (findings.length) blockers.push(`${findings.length} source checks are unresolved; working adjustments do not silently clear checks.`);
    blockers.push('Full-return readiness is unavailable: broader checks and required tax/completeness work are not implemented or resolved.');
  } else {
    const n1 = projection.adjustments[`${version}::F8949.B.N1`];
    const basisCheck = findings.find(f => f.ruleId === 'supplemental-basis' && f.affectedClaims.includes('F8949.B.N1'));
    const expectedBasis = basisCheck?.expected.value;
    if (!n1 || n1.reversed || n1.field !== 'basis' || typeof expectedBasis !== 'number' || n1.effectiveValue !== expectedBasis || !n1.evidenceRefs.includes('ev-0066') || !basisCheck?.evidenceAvailable || n1.workingGain !== Number(getLine('F8949.B.N1', version)?.value) - expectedBasis) blockers.push('N1 demo requires the supported supplemental basis correction and ev-0066 evidence.');
  }
  if (snapshot.scope === 'prepared_demo') {
    const verification=projection.verifications[`${version}::F8949.B.N1`];
    if (!verification?.open || verification.conclusion !== 'verified' || verification.checkedFingerprint !== verificationFingerprint('F8949.B.N1',version,projection)) blockers.push('A current verified conclusion for N1 evidence and working values is required.');
  }
  const partnerRequired = snapshot.summary.adjustments.some(a => Math.abs(a.federalEstimate ?? 0) > 1000 || Math.abs(a.californiaEstimate ?? 0) > 1000);
  const approved = state.approvals.filter(a => a.snapshotId === snapshot.id && a.contentHash === snapshot.contentHash && a.presentedSummaryHash === hashSnapshotSummary(snapshot));
  if (!approved.some(a => a.level === 'reviewer')) blockers.push('Reviewer approval of this exact package is required.');
  if (partnerRequired && !approved.some(a => a.level === 'partner')) blockers.push('Partner approval is required for an estimated tax effect above $1,000.');
  if (!approved.some(a => a.level === 'client')) blockers.push('Client approval of the presented package is required.');
  return { ready:blockers.length === 0, blockers,partnerRequired,current,openNoteCount:openNotes.length,unresolvedCheckCount:findings.length };
}

export async function loadFilingState(options: Context): Promise<FilingState> {
  const { workspaceId, branchId='main', version='v3', asOf=DEFAULT_AS_OF } = options;
  const store = options.store ?? getEventStore();
  if (!validWorkspaceId(workspaceId)) throw new Error('Invalid workspace');
  await store.ensureWorkspace(workspaceId);
  if (!await store.getBranch(workspaceId, branchId)) throw new Error('Branch not found in this workspace');
  const history = await store.listEvents(workspaceId,branchId);
  const projection = reduceEvents(workspaceId,branchId,history);
  const snapshots = history.flatMap(e => e.payload.kind === 'snapshot_created' && e.payload.snapshot.branchId === branchId ? [e.payload.snapshot]:[]);
  const ownSnapshotIds = new Set(snapshots.map(s => s.id));
  const approvals = history.flatMap(e => e.payload.kind === 'package_approval_recorded' && ownSnapshotIds.has(e.payload.snapshotId) ? [{...e.payload,actorId:e.actorId,eventId:e.id,recordedAt:e.recordedAt}]:[]);
  const attempts = history.flatMap(e => e.payload.kind === 'filing_attempt_recorded' && ownSnapshotIds.has(e.payload.snapshotId) ? [{...e.payload,actorId:e.actorId,eventId:e.id,recordedAt:e.recordedAt}]:[]);
  const state:FilingState = { workspaceId,branchId,sequence:projection.sequence,frozen:attempts.length>0,snapshots,approvals,attempts,readiness:{},jurisdictionStatus:{federal:'not_submitted',california:'not_submitted'} };
  for (const snapshot of snapshots) state.readiness[snapshot.id] = readiness(snapshot,state,history,projection,version,asOf);
  for (const attempt of attempts) state.jurisdictionStatus[attempt.jurisdiction] = attempt.status;
  return state;
}

export type FilingCommandResult = { ok:true; state:FilingState; events:StoredEvent[]; deduped:boolean; branchId?:string } | { ok:false;code:'validation'|'forbidden'|'isolation'|'stale'|'conflict'|'not_ready';message:string;blockers?:string[] };
export async function executeFilingCommand(options: { command:FilingCommand; actorId:string; sessionWorkspaceId:string; asOf?:string;version?:string;store?:EventStore }): Promise<FilingCommandResult> {
  const parsed = FilingCommandSchema.safeParse(options.command);
  if (!parsed.success) return {ok:false,code:'validation',message:parsed.error.message};
  const command = parsed.data;
  const store=options.store??getEventStore(), asOf=options.asOf??DEFAULT_AS_OF, version=options.version??'v3';
  if (command.workspaceId !== options.sessionWorkspaceId || !validWorkspaceId(options.sessionWorkspaceId)) return {ok:false,code:'isolation',message:'Workspace isolation violation'};
  if (!getPacket().return_versions.some(v => v.version === version)) return {ok:false,code:'validation',message:'Unknown return version'};
  const actor = persona(options.actorId,asOf);
  if (!actor) return {ok:false,code:'forbidden',message:'Inactive persona'};
  const staff=['preparer','reviewer','partner'].includes(actor.role);
  if (command.type === 'approve_package' ? actor.role !== command.level : !staff) return {ok:false,code:'forbidden',message:'This persona cannot perform this filing action'};
  if (command.type === 'submit_filing' && actor.role !== 'partner') return {ok:false,code:'forbidden',message:'Only a partner may authorize simulated filing'};
  await store.ensureWorkspace(command.workspaceId);
  if (!await store.getBranch(command.workspaceId,command.branchId)) return {ok:false,code:'isolation',message:'Unknown workspace branch'};
  let state = await loadFilingState({workspaceId:command.workspaceId,branchId:command.branchId,version,asOf,store});
  const history = await store.listEvents(command.workspaceId,command.branchId);
  const hit = history.find(e => e.idempotencyKey === command.idempotencyKey);
  if (hit?.inheritedFromBranchId) return {ok:false,code:'conflict',message:'Idempotency key belongs to inherited history; start a new command.'};
  if (hit) return hit.actorId === options.actorId ? {ok:true,state,events:[hit],deduped:true} : {ok:false,code:'conflict',message:'Idempotency key belongs to another actor'};
  if (command.type === 'create_amendment' || command.type === 'create_successor') {
    for (const branch of await store.listBranches(command.workspaceId)) {
      if (branch.parentBranchId !== command.branchId) continue;
      const previous = (await store.listEvents(command.workspaceId,branch.id)).find(e => e.idempotencyKey === command.idempotencyKey && e.payload.kind === 'branch_created');
      if (previous) return previous.actorId === options.actorId ? {ok:true,state,events:[previous],deduped:true,branchId:branch.id} : {ok:false,code:'conflict',message:'Idempotency key belongs to another actor'};
    }
  }
  if (state.sequence !== command.expectedSequence) return {ok:false,code:'stale',message:'Workspace changed. Reload before continuing.'};
  const envelope = {id:`evt_${randomUUID()}`,workspaceId:command.workspaceId,branchId:command.branchId,actorId:options.actorId,recordedAt:new Date().toISOString(),effectiveAt:asOf,targetRefs:[],evidenceRefs:[],idempotencyKey:command.idempotencyKey};
  let event:Omit<StoredEvent,'sequence'>;
  if (command.type === 'freeze_package') {
    if (state.frozen) return {ok:false,code:'validation',message:'Submitted branch is frozen. Open a successor or amendment branch.'};
    const projection = reduceEvents(command.workspaceId,command.branchId,history);
    const content = contextContent(history,projection,version,asOf,command.scope);
    const manifest:FrozenSnapshot['manifest'] = {packetHash:loadPacket().sha256,policyVersion:POLICY_VERSION,stateHash:content.stateHash,eventIds:history.map(e => e.id),documentHashes:content.documentHashes,evidenceRefs:content.evidenceRefs,attachmentHashes:content.attachmentHashes};
    const snapshot:FrozenSnapshot = {id:`snap_${randomUUID()}`,workspaceId:command.workspaceId,branchId:command.branchId,createdAt:envelope.recordedAt,createdBy:options.actorId,engineVersion:version,asOf,scope:command.scope,label:content.summary.title,eventCutoff:state.sequence,contentHash:content.contentHash,manifestHash:sha256(manifest),manifest,summary:content.summary};
    event={...envelope,type:'snapshot_created',payload:{kind:'snapshot_created',snapshot}};
  } else {
    const snapshot=state.snapshots.find(s => s.id === command.snapshotId);
    if (!snapshot) return {ok:false,code:'isolation',message:'Snapshot is not available in this branch'};
    if (command.type === 'create_amendment' || command.type === 'create_successor') {
      const wanted=command.type === 'create_amendment'?'accepted':'rejected';
      if (!state.attempts.some(a => a.snapshotId === snapshot.id && a.status === wanted)) return {ok:false,code:'validation',message:`A ${wanted} attempt is required to create this branch`};
      const mode:'amendment'|'successor'=command.type === 'create_amendment'?'amendment':'successor';
      const branchId=`${mode === 'amendment'?'amend':'draft'}_${randomUUID()}`;
      const payload={kind:'branch_created' as const,parentBranchId:command.branchId,parentSnapshotId:snapshot.id,parentContentHash:snapshot.contentHash,mode,label:`${mode === 'amendment'?'Amendment':'Successor draft'} from ${snapshot.id.slice(0,13)}`};
      const result=await store.createBranch({workspaceId:command.workspaceId,branch:{id:branchId,label:payload.label,createdAt:envelope.recordedAt,parentBranchId:command.branchId,parentSnapshotId:snapshot.id,mode},baseEvents:history.filter(e => e.sequence <= snapshot.eventCutoff),creationEvent:{...envelope,branchId,type:'branch_created',payload,reason:command.reason}});
      if (!result.ok) return result;
      return {ok:true,state,events:result.events,deduped:result.deduped,branchId:result.events[0].branchId};
    }
    if (!state.readiness[snapshot.id].current) return {ok:false,code:'stale',message:'Package content changed. Freeze a new package before approval or submission.'};
    if (command.type === 'approve_package') {
      if (state.frozen) return {ok:false,code:'validation',message:'Submitted branch approvals are frozen.'};
      if (command.presentedSummaryHash !== hashSnapshotSummary(snapshot)) return {ok:false,code:'stale',message:'The approved summary does not match the presented package.'};
      if (command.level !== 'client' && ((getPacket().firm.assignment_at_start as {preparer?:string})?.preparer === options.actorId || materialEvents(history).some(e => e.actorId === options.actorId && (e.type === 'adjustment_recorded' || e.type === 'verification_recorded')))) return {ok:false,code:'forbidden',message:'Separation of duties: package reviewer cannot approve work they prepared or verified.'};
      event={...envelope,type:'package_approval_recorded',payload:{kind:'package_approval_recorded',snapshotId:snapshot.id,contentHash:snapshot.contentHash,level:command.level,presentedSummaryHash:command.presentedSummaryHash}};
    } else {
      if (!state.readiness[snapshot.id].ready) return {ok:false,code:'not_ready',message:'Simulated submission is blocked.',blockers:state.readiness[snapshot.id].blockers};
      if (state.attempts.some(a => a.jurisdiction === command.jurisdiction)) return {ok:false,code:'validation',message:'This jurisdiction already has a frozen attempt. Continue on a successor or amendment branch.'};
      event={...envelope,type:'filing_attempt_recorded',reason:command.reason,payload:{kind:'filing_attempt_recorded',snapshotId:snapshot.id,contentHash:snapshot.contentHash,jurisdiction:command.jurisdiction,status:command.simulatedResult,simulationOnly:true,reference:`SIM-${command.jurisdiction.toUpperCase()}-${randomUUID().slice(0,8)}`,reason:command.reason,scope:snapshot.scope}};
    }
  }
  const result=await store.appendEvents({workspaceId:command.workspaceId,branchId:command.branchId,events:[event],expectedBranchSequence:state.sequence});
  if (!result.ok) return result;
  state=await loadFilingState({workspaceId:command.workspaceId,branchId:command.branchId,version,asOf,store});
  return {ok:true,state,events:result.events,deduped:result.deduped};
}

/** Role-safe client surface deliberately excludes the internal evidence manifest and event text. */
export function clientFilingState(state: FilingState) {
  return {workspaceId:state.workspaceId,branchId:state.branchId,sequence:state.sequence,frozen:state.frozen,
    packages:state.snapshots.map(s => ({id:s.id,createdAt:s.createdAt,contentHash:s.contentHash,presentedSummaryHash:hashSnapshotSummary(s),summary:s.summary,current:state.readiness[s.id]?.current??false,approved:state.approvals.some(a => a.snapshotId === s.id && a.level === 'client')}))};
}

/** Validate frozen content against its immutable packet and exact historical cutoff. */
export function verifyFrozenSnapshot(snapshot: FrozenSnapshot, history: StoredEvent[]): boolean {
  try {
    const cutoff=history.filter(e => e.sequence <= snapshot.eventCutoff);
    if (cutoff.length !== snapshot.eventCutoff) return false;
    const projection=reduceEvents(snapshot.workspaceId,snapshot.branchId,cutoff);
    const content=contextContent(cutoff,projection,snapshot.engineVersion,snapshot.asOf,snapshot.scope);
    const manifest:FrozenSnapshot['manifest']={packetHash:loadPacket().sha256,policyVersion:POLICY_VERSION,stateHash:content.stateHash,eventIds:cutoff.map(e => e.id),documentHashes:content.documentHashes,evidenceRefs:content.evidenceRefs,attachmentHashes:content.attachmentHashes};
    return content.contentHash === snapshot.contentHash && sha256(content.summary) === sha256(snapshot.summary) && sha256(manifest) === snapshot.manifestHash && sha256(snapshot.manifest) === snapshot.manifestHash;
  } catch { return false; }
}
