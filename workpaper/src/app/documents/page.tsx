import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DispositionOverrideForm } from "@/components/DispositionOverrideForm";
import { loadProjection } from "@/lib/events/service";
import { documentHref } from "@/lib/navigation/href";
import { projectDocumentDispositions } from "@/lib/packet/dispositions";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export default async function DocumentsPage({ searchParams }: PageProps) {
  const session = await getWorkpaperSession();
  const { version: versionParam } = await searchParams;
  const version = versionParam ?? session.version;
  const projection = await loadProjection(
    session.workspaceId,
    session.branchId,
  );
  const docs = await deliver(session, "document-dispositions", projectDocumentDispositions(version, session.simulationDate, projection));

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
          Document library · dispositions
        </p>
        <h1 className="font-serif text-3xl">Simulated source documents</h1>
        <p className="text-sm text-ink-muted max-w-2xl">
          {docs.length} documents. Disposition is derived from version usage,
          supersession, and availability at {session.simulationDate}. Reviewer
          overrides persist as append-only events (sequence{" "}
          {projection.sequence}).
        </p>
      </header>

      <div className="overflow-hidden rounded border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-paper-deep/60 text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">ID</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Disposition</th>
              <th className="px-4 py-2 font-medium">Pages</th>
              <th className="px-4 py-2 font-medium">Extraction</th>
              <th className="px-4 py-2 font-medium">Used by</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2 font-mono align-top">
                  {doc.available ? (
                    <Link href={documentHref(doc.id, 1, { version })}>
                      {doc.id}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">{doc.id}</span>
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  {doc.available ? (
                    <Link
                      href={documentHref(doc.id, 1, { version })}
                      className="text-ink no-underline hover:underline"
                    >
                      {doc.title}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">
                      {doc.title}{" "}
                      <span className="text-xs">(unavailable at as-of)</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  <span className="font-mono text-xs">
                    {doc.disposition}
                    {doc.override ? " · override" : ""}
                  </span>
                  <div className="text-[11px] text-ink-muted max-w-xs">
                    {doc.dispositionReason}
                  </div>
                  {doc.available ? (
                    <DispositionOverrideForm
                      documentId={doc.id}
                      currentDisposition={doc.disposition}
                      branchSequence={projection.sequence}
                    />
                  ) : null}
                </td>
                <td className="px-4 py-2 font-mono align-top">{doc.pageCount}</td>
                <td className="px-4 py-2 text-ink-muted align-top">
                  {doc.extractionStatus}
                </td>
                <td className="px-4 py-2 font-mono align-top">
                  {doc.usedByLineCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
