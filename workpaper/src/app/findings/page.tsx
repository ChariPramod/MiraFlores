import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BulkAssignPanel } from "@/components/BulkAssignPanel";
import { findingsInbox } from "@/lib/checks/run";
import { loadProjection } from "@/lib/events/service";
import { claimHrefRequired } from "@/lib/navigation/href";
import { DEFAULT_AS_OF } from "@/lib/packet/availability";
import { getPacket } from "@/lib/packet/load";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function FindingsPage({ searchParams }: PageProps) {
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const inbox = await deliver(session, "findings", findingsInbox({ version, asOf: DEFAULT_AS_OF }));
  const projection = await loadProjection(
    session.workspaceId,
    session.branchId,
  );
  const packet = getPacket();
  const staffOptions = packet.firm.staff.filter(s => s.active_from <= session.simulationDate).map((s) => ({
    id: s.id,
    label: `${s.name} · ${s.role}`,
  }));

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
          Checks and review inbox
        </p>
        <h1 className="font-serif text-3xl">Independent findings</h1>
        <p className="text-sm text-ink-muted max-w-2xl">
          Deterministic checks with rule ID/version, evidence links, and as-of{" "}
          {inbox.asOf.slice(0, 10)}. Diagnostics from the engine are not treated
          as independent proof.
        </p>
      </header>

      <div className="mb-8">
        <BulkAssignPanel
          version={version}
          branchSequence={projection.sequence}
          staffOptions={staffOptions}
          scopeOptions={[
            { key: `${version}::F8949.B.N1`, label: "F8949.B.N1" },
            { key: `${version}::F8949.B.N3`, label: "F8949.B.N3" },
            { key: `${version}::SchD.7`, label: "SchD.7" },
            { key: `${version}::F1040.7`, label: "F1040.7" },
          ]}
          lastBatchId={null}
        />
      </div>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inbox.checks.map((check) => (
          <div
            key={check.checkId}
            className="rounded border border-line bg-panel px-4 py-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-ink-muted">
              {check.ruleId} · v{check.ruleVersion}
            </div>
            <div className="font-mono text-sm mt-1">{check.status}</div>
            <p className="text-xs text-ink-muted mt-1">{check.summary}</p>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="font-serif text-xl mb-3">Open findings</h2>
        <ul className="space-y-4">
          {inbox.open.map((f) => (
            <li
              key={f.id}
              className="rounded border border-line bg-panel p-4 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-ink">
                  {f.catalogId ? (
                    <span className="font-mono text-accent mr-2">
                      {f.catalogId}
                    </span>
                  ) : null}
                  {f.title}
                </h3>
                <span className="font-mono text-xs text-ink-muted">
                  {f.status} · {f.nuance} · {f.ruleId}@{f.ruleVersion}
                </span>
              </div>
              <p className="text-sm text-ink-muted">{f.explanation}</p>
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-[10px] uppercase text-ink-muted">Actual</dt>
                  <dd className="font-mono">{f.actual.display}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-ink-muted">
                    Expected
                  </dt>
                  <dd className="font-mono">{f.expected.display}</dd>
                </div>
              </dl>
              <div className="text-xs text-ink-muted">
                Versions: {f.affectedVersions.join(", ")} · Evidence available:{" "}
                {f.evidenceAvailable ? "yes" : "no"}
                {f.earliestEvidenceAt
                  ? ` · earliest ${f.earliestEvidenceAt.slice(0, 10)}`
                  : ""}
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {[...new Set(f.affectedClaims)].map((key) => (
                  <Link key={key} href={claimHrefRequired(key, version)}>
                    {key}
                  </Link>
                ))}
                {[...new Set(f.evidenceHrefs)].slice(0, 4).map((href) => (
                  <Link key={href} href={href}>
                    evidence
                  </Link>
                ))}
              </div>
              <p className="font-mono text-[10px] text-ink-muted break-all">
                {f.id}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-xl mb-3">Positive controls</h2>
        <ul className="space-y-3">
          {inbox.passedControls.map((f) => (
            <li
              key={f.id}
              className="rounded border border-accent/30 bg-accent-soft/40 px-4 py-3"
            >
              <div className="font-medium">{f.title}</div>
              <p className="text-sm text-ink-muted mt-1">{f.explanation}</p>
              <p className="font-mono text-xs mt-1">
                {f.ruleId}@{f.ruleVersion} · {f.status}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
