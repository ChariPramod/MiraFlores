import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { formatMoney } from "@/lib/format/money";
import { findingsHref } from "@/lib/navigation/href";
import { assertPacketInventory } from "@/lib/packet/load";
import { projectOverview } from "@/lib/packet/projections";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function OverviewPage({ searchParams }: PageProps) {
  assertPacketInventory();
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const overview = await deliver(session, "overview", projectOverview(version));

  return (
    <AppShell
      workspaceId={session.workspaceId}
      personaId={session.personaId}
      personaName={getPersonaLabel(session.personaId)}
      version={version}
      simulationDate={session.simulationDate}
    >
      <div className="space-y-8">
        <header className="max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
            Return overview · {overview.firmName}
          </p>
          <h1 className="font-serif text-4xl tracking-tight text-ink">
            {overview.clientName || "Household"}
          </h1>
          <p className="text-lg text-ink-muted">
            Tax year {overview.taxYear} ·{" "}
            {overview.filingStatus.replace(/_/g, " ")} · engine{" "}
            {overview.version} computed {overview.computedAt.slice(0, 10)}
          </p>
          <p className="text-sm text-ink-muted">
            Simulation clock is fixed at {overview.simulationDate}. Later packet
            evidence is available in the read-only Replay view.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            title="Federal"
            rows={[
              ["AGI", formatMoney(overview.federal.agi)],
              ["Taxable income", formatMoney(overview.federal.taxable_income)],
              ["Total tax", formatMoney(overview.federal.total_tax)],
              ["Payments", formatMoney(overview.federal.payments)],
              ["Balance due", formatMoney(overview.federal.balance_due)],
            ]}
          />
          <SummaryCard
            title="California"
            rows={[
              ["Total AGI", formatMoney(overview.california.total_agi)],
              ["CA AGI", formatMoney(overview.california.ca_agi)],
              ["Total tax", formatMoney(overview.california.total_tax)],
              ["Payments", formatMoney(overview.california.payments)],
              ["Balance due", formatMoney(overview.california.balance_due)],
            ]}
          />
        </div>

        <section className="rounded border border-line bg-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Trace a claim</h2>
            <Link href={findingsHref(version)} className="text-sm">
              Open findings inbox →
            </Link>
          </div>
          <p className="text-sm text-ink-muted mt-1 mb-4">
            Follow capital gain to lot N1, inspect the printed basis field, and
            navigate back with version preserved.
          </p>
          <ul className="divide-y divide-line">
            {overview.highlightClaims.map((claim) => (
              <li
                key={claim.key}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div>
                  <Link
                    href={claim.href}
                    className="font-mono text-base font-medium"
                  >
                    {claim.key}
                  </Link>
                  <span className="ml-2 text-sm text-ink-muted">
                    {claim.label}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-ink">
                  {claim.valueDisplay}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="rounded border border-line bg-paper-deep/40 px-4 py-3 text-xs text-ink-muted font-mono break-all">
          Packet SHA-256 {overview.integrity.sha256} ·{" "}
          {overview.integrity.byteLength.toLocaleString()} bytes · packaged under
          workpaper/data/ · server-only load
        </footer>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded border border-line bg-panel p-5">
      <h2 className="font-serif text-xl">{title}</h2>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
