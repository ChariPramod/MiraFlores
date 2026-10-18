import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { FilingPanel, type FilingView } from '@/components/FilingPanel';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';
import { persona } from '@/lib/security/policy';
import { getEventStore } from '@/lib/persistence/get-store';
import { loadFilingState, hashSnapshotSummary } from '@/lib/filing/service';
import { deliver } from '@/lib/security/delivery';

export default async function FilingPage() {
  const session=await getOrCreateWorkspaceSession();
  const actor=persona(session.personaId,session.simulationDate)!;
  if (!['preparer','reviewer','partner','quality_reviewer','client'].includes(actor.role)) redirect('/collaboration');
  const store=getEventStore();
  const state=await loadFilingState({workspaceId:session.workspaceId,branchId:session.branchId,version:session.version,asOf:session.simulationDate,store});
  const branches=await store.listBranches(session.workspaceId);
  // Clients never receive the manifest, internal notes, or blockers.
  const raw:FilingView={
    branchId:state.branchId,sequence:state.sequence,frozen:state.frozen,role:actor.role,
    branches:branches.map(b=>({id:b.id,label:b.label,parentSnapshotId:b.parentSnapshotId,parentBranchId:b.parentBranchId,mode:b.mode})),
    snapshots:state.snapshots.map(s=>({id:s.id,label:s.label,contentHash:s.contentHash,createdAt:s.createdAt,scope:s.scope,eventCutoff:s.eventCutoff,summary:s.summary,summaryHash:hashSnapshotSummary(s),current:state.readiness[s.id].current,...(actor.role!=='client'?{readiness:state.readiness[s.id]}:{})})),
    approvals:state.approvals.map(a=>({snapshotId:a.snapshotId,level:a.level,actorId:a.actorId})),
    attempts:state.attempts.map(a=>({snapshotId:a.snapshotId,jurisdiction:a.jurisdiction,status:a.status,reference:a.reference,recordedAt:a.recordedAt})),
    jurisdictionStatus:state.jurisdictionStatus,
  };
  const view=await deliver(session,'filing-packages',raw);
  return <AppShell workspaceId={session.workspaceId} personaId={actor.id} personaName={`${actor.name} · ${actor.role}`} version={session.version} simulationDate={session.simulationDate} syncLabel={state.frozen?'Submission frozen':'Draft workspace'}>
    <header className="mb-6 space-y-2"><h1 className="font-serif text-3xl">Filing and preserved records</h1><p className="text-sm text-ink-muted">Exact-package approvals, separate jurisdiction outcomes, and corrections that preserve the original record.</p><p className="rounded border border-line bg-paper-deep p-3 text-sm">All submissions here are simulations. The N1 package demonstrates the workflow; it is not a completed return or a full tax recomputation.</p></header>
    <FilingPanel view={view}/>
  </AppShell>;
}
