import { WorkspaceControls } from "@/components/WorkspaceControls";
import { activePersonas, persona } from "@/lib/security/policy";
import { getOrCreateWorkspaceSession } from "@/lib/workspace/session";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  assetsHref,
  claimHrefRequired,
  documentsHref,
  findingsHref,
  overviewHref,
  priorYearHref,
  salesHref,
} from "@/lib/navigation/href";

type AppShellProps = {
  children: ReactNode;
  workspaceId: string;
  personaId: string;
  personaName: string;
  version: string;
  simulationDate: string;
  syncLabel?: string;
  branchLabel?: string;
};

export async function AppShell({
  children,
  workspaceId,
  personaId,
  personaName,
  version,
  simulationDate,
  syncLabel = "Packet loaded",
  branchLabel,
}: AppShellProps) {
  const session = await getOrCreateWorkspaceSession();
  const role = persona(personaId)?.role;
  const taxAccess = ["preparer","reviewer","partner","quality_reviewer"].includes(role ?? "");
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            href={overviewHref(version)}
            className="no-underline hover:no-underline"
          >
            <span className="font-serif text-xl tracking-tight text-ink">
              MiraFlores
            </span>
            <span className="ml-2 text-xs uppercase tracking-[0.14em] text-ink-muted">
              Workpaper
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <Link href="/collaboration">Collaboration</Link>
            {taxAccess && <>
            <Link href={overviewHref(version)} className="hover:text-ink">
              Overview
            </Link>
            <Link
              href={claimHrefRequired("F1040.7", version)}
              className="hover:text-ink"
            >
              Evidence
            </Link>
            <Link href={findingsHref(version)} className="hover:text-ink">
              Findings
            </Link>
            <Link href={documentsHref(version)} className="hover:text-ink">
              Documents
            </Link>
            <Link href={salesHref(version)} className="hover:text-ink">
              Sales
            </Link>
            <Link href={assetsHref(version)} className="hover:text-ink">
              Assets
            </Link>
            <Link href={priorYearHref(version)} className="hover:text-ink">
              Prior year
            </Link>
            <Link href="/versions">Versions</Link>
            <Link href="/scenarios">What-ifs</Link>
            <Link href="/replay">Replay</Link>
            </>}
            {(taxAccess || role === 'client') && <Link href="/filing">Filing</Link>}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <span title="Demonstration persona — not production identity">
              Role:{" "}
              <strong className="font-medium text-ink">{personaName}</strong>{" "}
              <span className="text-ink-muted">({personaId})</span>
            </span>
            <span>
              Branch: <strong className="font-medium text-ink">{branchLabel ?? session.branchId}</strong>
            </span>
            <span>
              Version:{" "}
              <strong className="font-medium text-ink">{version}</strong>
            </span>
            <span>
              As of:{" "}
              <strong className="font-medium text-ink">{simulationDate}</strong>
            </span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
              {syncLabel}
            </span>
          </div>
        </div>
        <div className="border-t border-line/70 bg-paper-deep/50 px-4 py-1.5 text-[11px] text-ink-muted sm:px-6">
          Workspace{" "}
          <code className="font-mono text-[10px]">{workspaceId}</code>
          {" · "}
          Persistent visitor sandbox · Persona switching demonstrates authorization, not production identity verification.
          <WorkspaceControls workspaceId={workspaceId} branchId={session.branchId} personaId={personaId} locked={session.locked} options={activePersonas(session.simulationDate)} />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
