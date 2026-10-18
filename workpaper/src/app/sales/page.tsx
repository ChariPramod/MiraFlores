import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { projectSalesLots } from "@/lib/packet/areas";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function SalesPage({ searchParams }: PageProps) {
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const { exceptions, lots, totalCount } = await deliver(session, "sales", projectSalesLots(version));

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
          Area workspace · sales
        </p>
        <h1 className="font-serif text-3xl">Form 8949 lots</h1>
        <p className="text-sm text-ink-muted">
          {totalCount} lots · exceptions first · blank/zero basis kept distinct
          from missing support
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-serif text-xl mb-3">
          Exceptions ({exceptions.length})
        </h2>
        <LotTable rows={exceptions} />
      </section>

      <section>
        <h2 className="font-serif text-xl mb-3">All lots</h2>
        <LotTable rows={lots.slice(0, 80)} />
        {lots.length > 80 ? (
          <p className="text-xs text-ink-muted mt-2">
            Showing first 80 of {lots.length}. Open a claim key for full detail.
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}

function LotTable({
  rows,
}: {
  rows: ReturnType<typeof projectSalesLots>["lots"];
}) {
  if (!rows.length) {
    return <p className="text-sm text-ink-muted">None.</p>;
  }
  return (
    <div className="overflow-auto rounded border border-line bg-panel max-h-[480px]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-line bg-paper-deep/90 text-[11px] uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2">Key</th>
            <th className="px-3 py-2">Gain/(loss)</th>
            <th className="px-3 py-2">Proceeds</th>
            <th className="px-3 py-2">Basis</th>
            <th className="px-3 py-2">Term</th>
            <th className="px-3 py-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line/60">
              <td className="px-3 py-1.5 font-mono">
                <Link href={row.href}>{row.key}</Link>
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">
                {row.valueDisplay}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">
                {row.proceeds}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{row.basis}</td>
              <td className="px-3 py-1.5">{row.term}</td>
              <td className="px-3 py-1.5 text-warn text-xs">
                {row.exception ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
