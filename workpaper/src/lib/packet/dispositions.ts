import "server-only";

import type { WorkspaceProjection } from "@/lib/events/types";
import {
  DEFAULT_AS_OF,
  documentAvailableAt,
} from "@/lib/packet/availability";
import { getLinesUsingDocument } from "./indexes";
import { getPacket } from "./load";

export type DocumentDisposition =
  | "used"
  | "supporting_only"
  | "duplicate"
  | "superseded"
  | "irrelevant"
  | "pending"
  | "unavailable";

export type DocumentDispositionRow = {
  id: string;
  title: string;
  documentType: string;
  pageCount: number;
  extractionStatus: string;
  receivedAt: string;
  available: boolean;
  disposition: DocumentDisposition;
  dispositionReason: string;
  usedByLineCount: number;
  href: string;
  supersededBy?: string;
  supersedes?: string;
  override: boolean;
};

/**
 * Derive document dispositions from packet usage, supersession, and availability.
 * Explicit reviewer overrides from the event projection win when present.
 */
export function projectDocumentDispositions(
  version = "v3",
  asOf: string = DEFAULT_AS_OF,
  projection: WorkspaceProjection | null = null,
): DocumentDispositionRow[] {
  const packet = getPacket();
  const ret = packet.return_versions.find((v) => v.version === version);
  const used = new Set(ret?.documents_used ?? []);
  const superseded = new Set(ret?.documents_superseded ?? []);

  return packet.documents.map((doc) => {
    const available = documentAvailableAt(doc, asOf);
    const usedBy = getLinesUsingDocument(doc.id).filter((ref) =>
      ref.startsWith(`${version}:`) || !ref.includes(":"),
    );
    let disposition: DocumentDisposition;
    let dispositionReason: string;
    let override = false;

    const ov = projection?.dispositions[doc.id];
    if (ov && !ov.reversed) {
      disposition = ov.disposition as DocumentDisposition;
      dispositionReason = `Reviewer override: ${ov.explanation}`;
      override = true;
    } else if (!available) {
      disposition = "unavailable";
      dispositionReason = `Received ${doc.received_at.slice(0, 10)}; after simulation as-of ${asOf.slice(0, 10)}.`;
    } else if (superseded.has(doc.id) || doc.superseded_by) {
      disposition = "superseded";
      dispositionReason = doc.superseded_by
        ? `Superseded by ${doc.superseded_by}`
        : "Listed in version documents_superseded";
    } else if (used.has(doc.id)) {
      disposition = "used";
      dispositionReason = `Cited in ${version} documents_used`;
    } else if (usedBy.length > 0) {
      disposition = "supporting_only";
      dispositionReason = `${usedBy.length} line source citation(s) via extractions`;
    } else if (doc.extraction.status === "not_extracted") {
      disposition = "pending";
      dispositionReason = "Not extracted — disposition pending reviewer";
    } else {
      disposition = "pending";
      dispositionReason = "Available but not cited on current version — pending disposition";
    }

    // Duplicate heuristic: same type+issuer+tax_year with another used doc
    if (
      !override &&
      disposition === "pending" &&
      packet.documents.some(
        (other) =>
          other.id !== doc.id &&
          used.has(other.id) &&
          other.document_type === doc.document_type &&
          other.issuer === doc.issuer &&
          other.tax_year === doc.tax_year,
      )
    ) {
      disposition = "duplicate";
      dispositionReason =
        "Same type/issuer/year as a used document — candidate duplicate";
    }

    return {
      id: doc.id,
      title: doc.title,
      documentType: doc.document_type,
      pageCount: doc.page_count,
      extractionStatus: doc.extraction.status,
      receivedAt: doc.received_at,
      available,
      disposition,
      dispositionReason,
      usedByLineCount: usedBy.length,
      href: `/document/${doc.id}/page/1`,
      supersededBy: doc.superseded_by,
      supersedes: doc.supersedes,
      override,
    };
  });
}
