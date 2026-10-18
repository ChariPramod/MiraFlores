import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DocumentSheet } from "@/components/DocumentSheet";
import { renderDocumentPage } from "@/lib/documents/renderer";
import {
  claimHrefRequired,
  documentsHref,
} from "@/lib/navigation/href";
import { DEFAULT_AS_OF } from "@/lib/packet/availability";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  params: Promise<{ id: string; page: string }>;
  searchParams: Promise<{
    highlight?: string;
    version?: string;
    fromClaim?: string;
  }>;
};

export default async function DocumentPageView({
  params,
  searchParams,
}: PageProps) {
  const { id, page: pageStr } = await params;
  const { highlight, version: versionParam, fromClaim } = await searchParams;
  const session = await getWorkpaperSession();
  const version = versionParam ?? session.version;
  const pageNum = Number(pageStr);
  if (!Number.isInteger(pageNum) || pageNum < 1) notFound();

  const rendered = await deliver(session, `document:${id}:${pageNum}`, renderDocumentPage(id, pageNum, highlight, DEFAULT_AS_OF));
  if (!rendered) notFound();

  const reverseHref = fromClaim
    ? claimHrefRequired(fromClaim, version)
    : rendered.usedByLines[0]
      ? (() => {
          const first = rendered.usedByLines[0];
          const [ver, key] = first.includes(":")
            ? (first.split(":") as [string, string])
            : [version, first];
          return claimHrefRequired(key, ver);
        })()
      : null;

  const reverseLabel = fromClaim
    ? `${fromClaim} (${version})`
    : rendered.usedByLines[0] ?? null;

  return (
    <AppShell
      workspaceId={session.workspaceId}
      personaId={session.personaId}
      personaName={getPersonaLabel(session.personaId)}
      version={version}
      simulationDate={session.simulationDate}
    >
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link
          href={documentsHref(version)}
          className="text-ink-muted hover:text-ink"
        >
          ← Documents
        </Link>
        {reverseHref && reverseLabel ? (
          <Link href={reverseHref} className="hover:text-ink">
            ← Back to claim {reverseLabel}
          </Link>
        ) : null}
      </div>
      <DocumentSheet
        page={rendered}
        version={version}
        fromClaim={fromClaim}
      />
    </AppShell>
  );
}
