import { BulkAssignPanel } from "@/components/BulkAssignPanel";
import { AppShell } from '@/components/AppShell';
import { CollaborationPanel } from '@/components/CollaborationPanel';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';
import { activePersonas, persona } from '@/lib/security/policy';
import { getEventStore, persistenceMode } from '@/lib/persistence/get-store';
import { collaborationView } from '@/lib/workspace/collaboration';
import { reduceEvents } from '@/lib/events/reducer';
import { deliver, listAccessAudit } from '@/lib/security/delivery';
export default async function CollaborationPage() {
  const session=await getOrCreateWorkspaceSession();
  const actor=persona(session.personaId,session.simulationDate)!;
  const store=getEventStore();
  await store.ensureWorkspace(session.workspaceId);
  const events=await store.listEvents(session.workspaceId,session.branchId);
  const view=await deliver(session,'collaboration',collaborationView(events,actor.id));
  const notes= ['preparer','reviewer','partner'].includes(actor.role) ? await deliver(session,'review-notes',reduceEvents(session.workspaceId,session.branchId,events).notes) : [];
  const audit = actor.role === 'firm_administrator' ? await listAccessAudit(session) : [];
  return <AppShell workspaceId={session.workspaceId} personaId={actor.id} personaName={`${actor.name} · ${actor.role}`} version={session.version} simulationDate={session.simulationDate}>
    <header className="mb-6"><h1 className="font-serif text-3xl">Workspace collaboration</h1><p className="text-sm text-ink-muted">{actor.role==='client' ? 'Your questions and supporting evidence' : 'Assignments, client conversations, and review notes'} · Storage: {persistenceMode()==='local_file'?'local files (development only)':'Supabase'}</p></header>
    {actor.role === "firm_administrator" && <BulkAssignPanel version={session.version} branchSequence={events.at(-1)?.sequence ?? 0} staffOptions={activePersonas().filter(p => ["preparer","reviewer","partner"].includes(p.role)).map(p=>({id:p.id,label:p.name}))} scopeOptions={[{key:"v3::F8949.B.N1",label:"N1"},{key:"v3::F1040.7",label:"Capital gains"}]} lastBatchId={null} />}
    {actor.role === 'firm_administrator' && <section className="my-6 rounded border border-line p-4"><h2 className="font-serif text-xl">Unmasked access log</h2><p className="text-xs">Most recent 100 views. No sensitive values are stored in this log.</p><ul>{audit.map(row=><li key={row.id} className="text-xs font-mono">{row.recorded_at} · {row.actor_id} · {row.resource}</li>)}</ul></section>}
    <CollaborationPanel view={view} notes={notes} actorId={actor.id} role={actor.role} locked={session.locked} people={activePersonas(session.simulationDate)} />
  </AppShell>;
}
