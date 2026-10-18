import "server-only";
import type { StoredEvent } from "@/lib/events/types";
import { getEventStore } from "@/lib/persistence/get-store";
import type { EventStore } from "@/lib/persistence/store";
import type { WorkspaceSession } from "@/lib/workspace/session";
import { getLine } from "@/lib/packet/indexes";
import { refAvailableAt } from "@/lib/packet/availability";
import { resolveRef } from "@/lib/packet/resolve";
import { persona } from "@/lib/security/policy";
import { redact } from "@/lib/security/redaction";
import { validWorkspaceId } from "@/lib/security/tokens";
import type { FrozenSnapshot } from "./types";
import { verifyFrozenSnapshot } from "./service";

export type ExportKind = "client" | "notice";
type EvidenceItem = { ref: string; title: string; text: string; links: string[] };
export type SnapshotExport = {
  kind: ExportKind; title: string; snapshotId: string; scope: string; version: string;
  asOf: string; createdAt: string; eventCutoff: number; contentHash: string; manifestHash: string;
  summary: FrozenSnapshot["summary"]; evidence: EvidenceItem[];
  decisions: Array<{ id: string; actor: string; type: string; at: string; reason: string; refs: string[] }>;
  manifest?: FrozenSnapshot["manifest"];
  deliveryNote: string;
};

export class ExportError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Select only the signed session's workspace and a branch that actually belongs to it. */
export async function loadSnapshotExport(options: {
  session: WorkspaceSession; snapshotId: string; branchId?: string; kind: ExportKind; store?: EventStore;
}): Promise<SnapshotExport> {
  const { session, snapshotId, kind } = options;
  const branchId = options.branchId ?? session.branchId;
  const actor = persona(session.personaId, session.simulationDate);
  if (!actor || !["preparer", "reviewer", "partner", "quality_reviewer", "client"].includes(actor.role) || (kind === "notice" && actor.role === "client")) throw new ExportError("This persona cannot access that export.", 403);
  if (!validWorkspaceId(session.workspaceId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(branchId)) throw new ExportError("Export not found.", 404);
  const store = options.store ?? getEventStore();
  if (!await store.getBranch(session.workspaceId, branchId)) throw new ExportError("Export not found.", 404);
  const history = await store.listEvents(session.workspaceId, branchId);
  const creation = history.find(event => event.payload.kind === "snapshot_created" && event.payload.snapshot.id === snapshotId && event.payload.snapshot.workspaceId === session.workspaceId && event.payload.snapshot.branchId === branchId);
  if (creation?.payload.kind !== "snapshot_created") throw new ExportError("Export not found.", 404);
  const snapshot = creation.payload.snapshot;
  if (creation.sequence !== snapshot.eventCutoff + 1 || !verifyFrozenSnapshot(snapshot, history)) throw new ExportError("Snapshot integrity check failed. Export was not produced.", 409);
  const cutoff = history.filter(event => event.sequence <= snapshot.eventCutoff);
  return redact(projectExport(snapshot, cutoff, kind, actor.cleared), actor.id);
}

function projectExport(snapshot: FrozenSnapshot, history: StoredEvent[], kind: ExportKind, cleared: boolean): SnapshotExport {
  const evidence: EvidenceItem[] = [];
  const decisions: SnapshotExport["decisions"] = [];
  if (kind === "notice") {
    // The two evidence topics are assembled from the frozen return and available
    // sources. The later notice itself is never imported into an earlier snapshot.
    const queue = [...snapshot.manifest.evidenceRefs, "SchA.12", "SchC.1", "ev-1054", "D15"];
    for (const event of history) {
      if (["snapshot_created", "package_approval_recorded", "filing_attempt_recorded", "branch_created"].includes(event.type)) continue;
      const refs = event.evidenceRefs.filter(ref => !ref.startsWith("answer:") || history.some(e => e.id === ref.slice(7)));
      queue.push(...refs);
      const detail = "text" in event.payload ? event.payload.text : "resolution" in event.payload ? event.payload.resolution : "compensatingSummary" in event.payload ? event.payload.compensatingSummary : "";
      decisions.push({ id: event.id, actor: event.actorId, type: event.type, at: event.recordedAt, reason: [event.reason, detail].filter(Boolean).join("\n"), refs });
    }
    const visited = new Set<string>();
    while (queue.length) {
      const ref = queue.shift()!;
      if (visited.has(ref)) continue;
      visited.add(ref);
      const item = evidenceItem(ref, snapshot, history, cleared);
      evidence.push(item);
      queue.push(...item.links);
    }
  }
  return {
    kind, title: kind === "client" ? "Frozen client summary" : "Frozen evidence review package",
    snapshotId: snapshot.id, scope: snapshot.scope, version: snapshot.engineVersion, asOf: snapshot.asOf,
    createdAt: snapshot.createdAt, eventCutoff: snapshot.eventCutoff, contentHash: snapshot.contentHash,
    manifestHash: snapshot.manifestHash, summary: snapshot.summary, evidence, decisions,
    ...(kind === "notice" ? { manifest: snapshot.manifest } : {}),
    deliveryNote: `${cleared ? "Authorized unmasked copy; sensitive delivery is audited." : "Restricted values and attachments are masked."} Hashes identify the original frozen records, not this rendered/redacted HTML. This export contains only the snapshot cutoff; later decisions and evidence are excluded.`,
  };
}

function evidenceItem(ref: string, snapshot: FrozenSnapshot, history: StoredEvent[], cleared: boolean): EvidenceItem {
  if (ref.startsWith("answer:")) {
    const event = history.find(e => e.id === ref.slice(7));
    if (event?.payload.kind !== "answer_recorded") throw new ExportError(`Frozen evidence reference is missing: ${ref}`, 409);
    return { ref, title: "Client answer", text: event.payload.text + (event.payload.attachment ? cleared ? `\n\nAttachment: ${event.payload.attachment.name}\n${event.payload.attachment.text}` : "\n[Restricted attachment omitted]" : ""), links: [] };
  }
  if (!refAvailableAt(ref, snapshot.asOf)) throw new ExportError(`Frozen evidence was unavailable at the cutoff: ${ref}`, 409);
  const resolved = resolveRef(ref, { version: snapshot.engineVersion });
  if (resolved.kind === "missing") throw new ExportError(`Frozen evidence reference is missing: ${ref}`, 409);
  const docIsFrozen = (id: string, page?: number) => {
    const entry = snapshot.manifest.documentHashes.find(doc => doc.id === id);
    if (!entry || (page !== undefined && !entry.pages.includes(page))) throw new ExportError(`Document is not in the frozen manifest: ${id}`, 409);
  };
  if (resolved.kind === "extracted_value") {
    const value = resolved.value;
    docIsFrozen(value.document_id, value.page);
    return { ref, title: value.label, text: JSON.stringify({ field: value.field, extracted: value.value, textAsRead: value.text_as_read, confidence: value.confidence }, null, 2), links: [`doc:${value.document_id}#page${value.page}`] };
  }
  if (resolved.kind === "document_page") {
    docIsFrozen(resolved.document.id, resolved.page);
    return { ref, title: `${resolved.document.title} — page ${resolved.page}`, text: resolved.document.pages.find(page => page.page === resolved.page)!.printed_content, links: [] };
  }
  if (resolved.kind === "document") {
    docIsFrozen(resolved.value.id);
    return { ref, title: resolved.value.title, text: `${resolved.value.document_type}; received ${resolved.value.received_at}`, links: resolved.value.pages.map(page => `doc:${resolved.value.id}#page${page.page}`) };
  }
  const line = getLine(ref, snapshot.engineVersion);
  if (line) return { ref, title: line.label, text: JSON.stringify({ suppliedValue: line.value, rule: line.rule }, null, 2), links: [...line.sources, ...line.inputs] };
  // Only the individually resolved record is included, never its packet container.
  return { ref, title: resolved.kind.replaceAll("_", " "), text: JSON.stringify("value" in resolved ? resolved.value : resolved, null, 2), links: [] };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
const anchor = (ref: string) => `ref-${Buffer.from(ref).toString("base64url")}`;
const link = (ref: string) => `<a href="#${anchor(ref)}">${escapeHtml(ref)}</a>`;

/** No JavaScript, network resources, forms, or active untrusted HTML. */
export function renderSnapshotExport(dto: SnapshotExport): string {
  const esc = escapeHtml;
  const evidence = dto.evidence.map(item => `<article id="${anchor(item.ref)}"><h3>${esc(item.ref)} — ${esc(item.title)}</h3><pre>${esc(item.text)}</pre>${item.links.length ? `<p>Sources: ${item.links.map(link).join(" · ")}</p>` : ""}</article>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(dto.title)}</title><style>body{max-width:960px;margin:40px auto;padding:0 24px;font:16px/1.5 system-ui;color:#192b2d}h1,h2,h3{line-height:1.2}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f4;padding:16px;font-size:13px}article{padding:12px 0;border-top:1px solid #cad4d1}a{color:#175c50}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cad4d1;padding:8px;text-align:left}code{overflow-wrap:anywhere}aside{border:2px solid #886a20;padding:12px}@media print{body{margin:0}article{break-inside:avoid}}</style></head><body>
<h1>${esc(dto.title)}</h1><aside><strong>${esc(dto.summary.title)}</strong><p>Simulation only. No tax return was transmitted. Working values and estimates are not a fully recomputed return.</p></aside>
<p>Snapshot <code>${esc(dto.snapshotId)}</code> · ${esc(dto.version)} · scope ${esc(dto.scope)}<br>Frozen ${esc(dto.createdAt)} · evidence as of ${esc(dto.asOf)} · event cutoff ${dto.eventCutoff}</p>
<h2>Client summary</h2><table><tr><th>N1</th><th>Supplied engine</th><th>Working review</th></tr><tr><th>Basis</th><td>${esc(dto.summary.n1.engineBasis)}</td><td>${esc(dto.summary.n1.workingBasis ?? "Not adjusted")}</td></tr><tr><th>Gain</th><td>${esc(dto.summary.n1.engineGain)}</td><td>${esc(dto.summary.n1.workingGain ?? "Not adjusted")}</td></tr></table>
<h2>Working adjustments and estimated effects</h2><pre>${esc(JSON.stringify(dto.summary.adjustments, null, 2))}</pre><ul>${dto.summary.limitations.map(text => `<li>${esc(text)}</li>`).join("")}</ul>
${dto.kind === "notice" ? `<h2>Review topics</h2><p>Noncash charitable contributions: ${link("SchA.12")}. Schedule C gross receipts: ${link("SchC.1")}. This package assembles frozen evidence; it does not resolve the open tax treatments or certify a notice response.</p><h2>Decision history through the cutoff</h2>${dto.decisions.map(event => `<article><h3>${esc(event.type)} · ${esc(event.actor)}</h3><p>${esc(event.at)} · <code>${esc(event.id)}</code></p><p>${esc(event.reason)}</p><p>${event.refs.map(link).join(" · ")}</p></article>`).join("")}<h2>Evidence index</h2><ul>${dto.evidence.map(item => `<li>${link(item.ref)} — ${esc(item.title)}</li>`).join("")}</ul>${evidence}<h2>Frozen integrity manifest</h2><p>All document hashes describe original packet records. The evidence index above identifies the subset enclosed in this package.</p><pre>${esc(JSON.stringify(dto.manifest, null, 2))}</pre>` : ""}
<h2>Integrity and delivery</h2><p>Content SHA-256: <code>${esc(dto.contentHash)}</code><br>Manifest SHA-256: <code>${esc(dto.manifestHash)}</code></p><p>${esc(dto.deliveryNote)}</p></body></html>`;
}
