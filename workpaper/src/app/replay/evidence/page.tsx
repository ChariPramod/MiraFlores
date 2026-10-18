import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getWorkpaperSession } from '@/lib/workspace/session';
import { getPersonaLabel } from '@/lib/workspace/staff';
import { deliver } from '@/lib/security/delivery';
import { DEFAULT_REPLAY_STAGE, projectReplayEvidence, replayCursor } from '@/lib/replay/projections';

export default async function ReplayEvidencePage({ searchParams }: { searchParams: Promise<{ at?: string; ref?: string; page?: string }> }) {
  const session = await getWorkpaperSession();
  const { at = DEFAULT_REPLAY_STAGE, ref = '', page = '1' } = await searchParams;
  const cursor = replayCursor(at);
  if (!cursor) notFound();
  const projection = projectReplayEvidence(at, ref, Number(page));
  const evidence = projection ? await deliver(session, `replay:${at}:${ref}:${page}`, projection) : null;
  const pageHref = (n: number) => `/replay/evidence?${new URLSearchParams({ at, ref, page: String(n) })}`;
  return <AppShell workspaceId={session.workspaceId} personaId={session.personaId} personaName={getPersonaLabel(session.personaId)} version={cursor.version ?? session.version} simulationDate={cursor.asOf.slice(0, 10)} branchLabel="Replay (read-only)">
    <Link href={`/replay?at=${encodeURIComponent(at)}`}>← Back to replay at {cursor.asOf.slice(0, 10)}</Link>
    <header className="my-6 space-y-2"><p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Read-only replay evidence</p><h1 className="font-serif text-3xl">{evidence ? `${evidence.ref} · ${evidence.title}` : 'Evidence unavailable at this milestone'}</h1><p className="text-sm text-ink-muted">Working draft and June 23 evidence permissions are unchanged. Document pages are simulated from the packet’s printed content.</p></header>
    {evidence ? <><nav className="mb-4 flex gap-4 text-sm">{evidence.page > 1 && <Link href={pageHref(evidence.page - 1)}>← Previous page</Link>}<span>Page {evidence.page} / {evidence.pages}</span>{evidence.page < evidence.pages && <Link href={pageHref(evidence.page + 1)}>Next page →</Link>}</nav><article className="max-w-4xl whitespace-pre-wrap rounded border border-line bg-panel p-6 font-mono text-sm leading-7">{evidence.text}</article></> : <p className="rounded border border-line bg-panel p-6 text-sm">This reference is missing, not yet received, or unsupported in the replay evidence viewer. Select a later milestone from the timeline to inspect evidence when it becomes available.</p>}
  </AppShell>;
}
