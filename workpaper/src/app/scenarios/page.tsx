import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getWorkpaperSession } from '@/lib/workspace/session';
import { getPersonaLabel } from '@/lib/workspace/staff';
import { deliver } from '@/lib/security/delivery';
import { projectScenarios, displayValue } from '@/lib/replay/projections';
import { formatMoney } from '@/lib/format/money';
import { loadProjection } from '@/lib/events/service';

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const session = await getWorkpaperSession();
  const { scenario } = await searchParams;
  const projection = projectScenarios(scenario);
  if (!projection) notFound();
  const dto = await deliver(session, 'supplied-scenarios', projection);
  const state = await loadProjection(session.workspaceId, session.branchId);
  const workingAdjustmentCount = Object.values(state.adjustments).filter(a => !a.reversed).length;
  const selected = dto.selected;
  return <AppShell workspaceId={session.workspaceId} personaId={session.personaId} personaName={getPersonaLabel(session.personaId)} version="v3" simulationDate={session.simulationDate} branchLabel="Supplied what-if (read-only)">
    <header className="mb-6 space-y-2"><p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Five supplied alternatives</p><h1 className="font-serif text-3xl">What-if comparison</h1><p className="max-w-3xl text-sm text-ink-muted">Each alternative is exact only relative to the packet’s unadjusted v3 engine baseline. Alternatives cannot be added together or represented as a recomputation of your reviewed return.</p><Link href="/">Return to working draft</Link></header>
    <div className="mb-6 rounded border border-warn/30 bg-warn-soft p-4 text-sm"><strong>Baseline: original v3 · computed {dto.baseline.at.slice(0,10)}</strong><p className="mt-1">Your workspace has {workingAdjustmentCount} active adjustment{workingAdjustmentCount === 1 ? '' : 's'}. These are excluded from every result below. No scenario is applied to the working return.</p></div>
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded border border-line bg-panel p-4"><label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">One supplied alternative<select name="scenario" defaultValue={selected.id} className="max-w-full rounded border border-line bg-paper p-2">{dto.options.map(o => <option key={o.id} value={o.id}>{o.description}</option>)}</select></label><button className="rounded bg-accent px-4 py-2 text-sm text-white">Compare alternative</button></form>
    <h2 className="mb-4 font-serif text-xl">{selected.description}</h2>
    {!dto.baselineMatches ? <p className="rounded border border-warn bg-warn-soft p-4">Scenario baseline does not match the supplied return. Exact results withheld.</p> : <>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">{(['federal','california'] as const).map(j => <section key={j} className="overflow-auto rounded border border-line bg-panel"><h3 className="p-4 font-serif text-xl capitalize">{j}</h3><table className="w-full text-left text-sm"><thead className="bg-paper-deep text-xs uppercase text-ink-muted"><tr><th className="p-3">Metric</th><th className="p-3">Original v3</th><th className="p-3">Alternative</th><th className="p-3">Difference</th></tr></thead><tbody>{Object.entries(selected[j].base).map(([key,value]) => <tr key={key} className="border-t border-line"><td className="p-3">{key.replaceAll('_',' ')}</td><td className="p-3 font-mono">{formatMoney(value)}</td><td className="p-3 font-mono">{formatMoney(selected[j].alternative[key])}</td><td className="p-3 font-mono">{formatMoney(selected[j].alternative[key] - value)}</td></tr>)}</tbody></table><p className="border-t border-line p-3 text-sm">Supplied tax change: ${formatMoney(selected[j].total_tax_change)}{selected[j].penalty_change !== undefined ? ` · Penalty change: $${formatMoney(selected[j].penalty_change)}` : ''}</p></section>)}</div>
      <section className="overflow-auto rounded border border-line bg-panel"><h3 className="p-4 font-serif text-xl">{selected.changed_lines.length} supplied changed lines</h3>{selected.changed_lines.length ? <table className="w-full text-left text-sm"><thead className="bg-paper-deep text-xs uppercase text-ink-muted"><tr><th className="p-3">Line</th><th className="p-3">Original v3</th><th className="p-3">Alternative</th></tr></thead><tbody>{selected.changed_lines.map(r => <tr key={r.key} className="border-t border-line"><td className="p-3 font-mono">{r.key}</td><td className="p-3 font-mono">{displayValue(r.old)}</td><td className="p-3 font-mono">{displayValue(r.new)}</td></tr>)}</tbody></table> : <p className="px-4 pb-4 text-sm text-ink-muted">The supplied annualized-penalty alternative changes neither line values nor the $164 federal penalty. No savings are inferred.</p>}</section>
    </>}
  </AppShell>;
}
