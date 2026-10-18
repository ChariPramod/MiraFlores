import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { claimHrefRequired } from "@/lib/navigation/href";
import { projectPriorYearComparison } from "@/lib/packet/areas";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function PriorYearPage({ searchParams }: PageProps) {
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const { swings, rows } = await deliver(session, "prior-year", projectPriorYearComparison(version));

  return (
    <AppShell
      workspaceId={session.workspaceId}
      personaId={session.personaId}
      personaName={getPersonaLabel(session.personaId)}
      version={version}
      simulationDate={session.simulationDate}
    >
      <header className="mb-6 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
          Prior-year comparison
        </p>
        <h1 className="font-serif text-3xl">2024 → {version}</h1>
        <p className="text-sm text-ink-muted max-w-2xl">
          Firm swing threshold: over 10% <em>and</em> over $1,000. Zero prior
          baselines are handled explicitly (percentage n/a).
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-serif text-xl mb-3">
          Swing flags ({swings.length})
        </h2>
        <SwingTable rows={swings} version={version} />
      </section>

      <section>
        <h2 className="font-serif text-xl mb-3">
          Compared lines ({rows.length})
        </h2>
        <SwingTable rows={rows.slice(0, 40)} version={version} />
      </section>
    </AppShell>
  );
}

function SwingTable({
  rows,
  version,
}: {
  rows: ReturnType<typeof projectPriorYearComparison>["rows"];
  version: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">None.</p>;
  }
  return (
    <div className="overflow-auto rounded border border-line bg-panel max-h-[420px]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-line bg-paper-deep/90 text-[11px] uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2">Line</th>
            <th className="px-3 py-2">Prior</th>
            <th className="px-3 py-2">Current</th>
            <th className="px-3 py-2">Δ</th>
            <th className="px-3 py-2">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-line/60 ${r.swing ? "bg-warn-soft/40" : ""}`}
            >
              <td className="px-3 py-1.5">
                <Link
                  href={claimHrefRequired(r.key, version)}
                  className="font-mono"
                >
                  {r.key}
                </Link>
                <div className="text-xs text-ink-muted">{r.label}</div>
                {r.note ? (
                  <div className="text-[11px] text-warn">{r.note}</div>
                ) : null}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{r.prior}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{r.current}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{r.delta}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
