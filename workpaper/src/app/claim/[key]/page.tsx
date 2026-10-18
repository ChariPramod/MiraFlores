import { persona } from "@/lib/security/policy";
import { getEventStore } from "@/lib/persistence/get-store";
import { collaborationView } from "@/lib/workspace/collaboration";
import { deliver } from "@/lib/security/delivery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EvidenceTrail } from "@/components/EvidenceTrail";
import { loadProjection } from "@/lib/events/service";
import { overviewHref } from "@/lib/navigation/href";
import {
  projectCalculationTree,
  projectClaim,
} from "@/lib/packet/projections";
import { getWorkpaperSession } from "@/lib/workspace/session";
import { getPersonaLabel } from "@/lib/workspace/staff";

type PageProps = {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ version?: string }>;
};

export default async function ClaimPage({ params, searchParams }: PageProps) {
  const { key: rawKey } = await params;
  const { version: versionParam } = await searchParams;
  const session = await getWorkpaperSession();
  const key = decodeURIComponent(rawKey);
  const version = versionParam ?? session.version;

  const projection = await loadProjection(
    session.workspaceId,
    session.branchId,
  );
  const claim = await deliver(session, `claim:${key}`, projectClaim(key, version, session.simulationDate, projection));
  if (!claim) notFound();
  const conversation = await deliver(session, "claim-answers", collaborationView(await getEventStore().listEvents(session.workspaceId, session.branchId), session.personaId));
  const answerEvidence = conversation.questions.filter(q => q.claimKey === key).flatMap(q => q.answers.map(a => ({ ref: `answer:${a.id}`, label: `Client answer: ${a.text.slice(0, 100)}` })));
  const tree = await deliver(session, `tree:${key}`, projectCalculationTree(key, version));

  return (
    <AppShell
      workspaceId={session.workspaceId}
      personaId={session.personaId}
      personaName={getPersonaLabel(session.personaId)}
      version={version}
      simulationDate={session.simulationDate}
    >
      <div className="mb-4 text-sm">
        <Link
          href={overviewHref(version)}
          className="text-ink-muted hover:text-ink"
        >
          ← Overview
        </Link>
      </div>
      <EvidenceTrail claim={claim} tree={tree} actorRole={persona(session.personaId)!.role} answerEvidence={answerEvidence} />
    </AppShell>
  );
}
