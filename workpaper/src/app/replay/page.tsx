import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getWorkpaperSession } from '@/lib/workspace/session';
import { getPersonaLabel } from '@/lib/workspace/staff';
import { deliver } from '@/lib/security/delivery';
import { DEFAULT_REPLAY_STAGE, projectReplay } from '@/lib/replay/projections';
import { formatMoney } from '@/lib/format/money';

export default async function ReplayPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const session = await getWorkpaperSession();
  const { at = DEFAULT_REPLAY_STAGE } = await searchParams;
  const projection = projectReplay(at);
  if (!projection) notFound();
  const replay = await deliver(session, `replay:${at}`, projection);
  const evidenceHref = (ref: string) => `/replay/evidence?${new URLSearchParams({ at, ref })}`;
  return <AppShell workspaceId={session.workspaceId} personaId={session.personaId} personaName={getPersonaLabel(session.personaId)} version={replay.version ?? session.version} simulationDate={replay.asOf.slice(0, 10)} branchLabel="Replay (read-only)">
    <header className="mb-6 space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Isolated packet history</p>
      <h1 className="font-serif text-3xl">Timeline replay</h1>
      <p className="max-w-3xl text-sm text-ink-muted">Seek to a supplied milestone to inspect evidence available at that instant. This view does not append events, apply adjustments, change the working clock, or create filing decisions. Scripted approvals and agency events below describe the case-study timeline.</p>
      <Link href="/">Return to working draft · v3 · June 23, 2026</Link>
    </header>
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded border border-line bg-panel p-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Replay milestone<select name="at" defaultValue={at} className="max-w-full rounded border border-line bg-paper p-2">{replay.stages.map(t => <option key={t.id} value={t.id}>{t.at.slice(0, 10)} · {t.label}</option>)}</select></label>
      <button className="rounded bg-accent px-4 py-2 text-sm text-white">Seek</button>
    </form>
    <div className="mb-6 rounded border border-accent/30 bg-accent-soft p-4 text-sm"><strong>Replay as of {replay.asOf}</strong> · {replay.documents.length} documents · {replay.messages.length} messages · {replay.version ?? 'No engine output yet'}<div className="mt-1 text-xs">Available staff: {replay.actors.filter(p => p.role !== 'client').map(p => `${p.name} (${p.role})`).join(' · ')}. The active viewing identity remains your workspace persona.</div></div>
    {replay.summary && <section className="mb-6 grid gap-3 sm:grid-cols-2">{(['federal', 'california'] as const).map(j => <div key={j} className="rounded border border-line bg-panel p-4"><h2 className="font-serif text-xl capitalize">{j} supplied {replay.version}</h2><p className="mt-2 text-sm">Total tax ${formatMoney(replay.summary![j].total_tax)} · Payments ${formatMoney(replay.summary![j].payments)} · Balance / (refund) ${formatMoney(replay.summary![j].balance_due)}</p><p className="mt-2 text-xs text-ink-muted">Historical engine output; reviewer adjustments are excluded.</p></div>)}</section>}
    {replay.versionChange && <p className="mb-6 text-sm"><Link href={`/versions?from=${replay.versionChange.from.id}&to=${replay.versionChange.to.id}`}>{replay.versionChange.rows.length} changed line values from {replay.versionChange.from.id} to {replay.versionChange.to.id}</Link>. Superseded evidence: {replay.versionChange.supersededDocuments.join(', ') || 'none'}.</p>}
    {replay.extension && <section className="mb-6 rounded border border-line bg-panel p-4"><h2 className="font-serif text-xl">Extension estimate retained from {replay.extension.based_on_version}</h2><p className="mt-2 text-sm">Federal estimated tax ${formatMoney(replay.extension.federal.estimated_total_tax)}; estimated balance ${formatMoney(replay.extension.federal.estimated_balance)}; Form 4868 payment ${formatMoney(replay.extension.federal.paid_with_form_4868)}. California payment ${formatMoney(replay.extension.california.paid_with_ftb_3519)}.</p><p className="mt-1 text-xs text-ink-muted">The later v3 return does not replace the original estimate.</p></section>}
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section><h2 className="mb-3 font-serif text-xl">Events through this milestone</h2><ol className="space-y-3">{replay.history.map(t => <li key={t.id} className={`rounded border p-3 ${t.id === at ? 'border-accent bg-accent-soft' : 'border-line bg-panel'}`}><Link href={`/replay?at=${t.id}`} className="text-sm font-medium">{t.at.slice(0, 10)} · {t.event.replaceAll('_', ' ')}</Link>{t.detail && <p className="mt-1 text-sm text-ink-muted">{t.detail}</p>}<div className="mt-1 flex flex-wrap gap-2 text-xs">{t.refs.map(ref => /^(D\d{2}|msg-\d+|call-\d+)$/.test(ref) ? <Link key={ref} href={evidenceHref(ref)}>{ref}</Link> : <span key={ref} className="font-mono text-ink-muted">{ref}{ref.startsWith('agency:') ? ' · scripted agency reference' : ''}</span>)}</div></li>)}</ol></section>
      <div className="space-y-6">
        <section><h2 className="mb-3 font-serif text-xl">Available client messages</h2><div className="space-y-3">{replay.messages.length === 0 && <p className="text-sm text-ink-muted">No messages available.</p>}{replay.messages.map(m => <article key={m.id} className="rounded border border-line bg-panel p-3"><Link href={evidenceHref(m.id)} className="text-xs">{m.id} · {m.at.slice(0, 10)} · {m.from}</Link><p className="mt-2 whitespace-pre-wrap text-sm">{m.text}</p></article>)}</div></section>
        <section><h2 className="mb-3 font-serif text-xl">Available source documents</h2><div className="max-h-[640px] overflow-y-auto rounded border border-line bg-panel">{replay.documents.map(d => <div key={d.id} className="border-b border-line p-3 text-sm"><Link href={evidenceHref(d.id)}><span className="font-mono">{d.id}</span> · {d.title}</Link><p className="mt-1 text-xs text-ink-muted">Received {d.receivedAt.slice(0, 10)} · {d.pages} pages{d.superseded ? ' · superseded in this engine version' : ''}</p></div>)}</div></section>
      </div>
    </div>
  </AppShell>;
}
