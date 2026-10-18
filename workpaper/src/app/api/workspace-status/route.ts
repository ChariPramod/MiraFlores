import { NextResponse } from 'next/server';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';
import { getEventStore } from '@/lib/persistence/get-store';
import { collaborationView } from '@/lib/workspace/collaboration';
import { persona } from '@/lib/security/policy';
export async function GET() {
  const session = await getOrCreateWorkspaceSession();
  const events = await getEventStore().listEvents(session.workspaceId, session.branchId);
  const view = collaborationView(events, session.personaId);
  const role = persona(session.personaId)?.role;
  // Clients receive revisions of visible conversations and filing summaries only.
  const revision = role === 'client' ? JSON.stringify([view.questions.map(q => [q.id,q.answers.map(a=>a.id),q.resolved]), events.filter(e => ['snapshot_created','package_approval_recorded','filing_attempt_recorded'].includes(e.type)).map(e=>e.id)]) : String(events.at(-1)?.sequence ?? 0);
  return NextResponse.json({ sessionKey: `${session.workspaceId}:${session.personaId}:${session.branchId}`, revision, notificationCount:view.notices.length }, { headers:{ 'Cache-Control':'private, no-store' } });
}
