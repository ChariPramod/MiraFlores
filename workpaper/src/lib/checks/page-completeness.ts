import "server-only";

import {
  DEFAULT_AS_OF,
  documentAvailableAt,
  earliestEvidenceInstant,
} from "@/lib/packet/availability";
import { getDocument, getExtractedForDocument } from "@/lib/packet/indexes";
import { getPacket } from "@/lib/packet/load";
import { documentHref } from "@/lib/navigation/href";
import { catalogIdFor } from "./catalog";
import { displayValue } from "./format";
import type { CheckContext, CheckFinding, CheckResult } from "./types";

export const RULE_ID = "page-completeness";
export const RULE_VERSION = "1.0.0";

type PrintedLot = {
  lotId: string;
  proceeds: number;
  basis: number;
  description: string;
};

function parsePrintedLots(content: string): PrintedLot[] {
  const lots: PrintedLot[] = [];
  const re =
    /\b([A-Z]\d+[A-Z0-9]*)\s+([^0-9]+?)\s+([\d.]+)\s*sh\s+acquired\s+\S+\s+sold\s+\S+\s+proceeds\s+([\d,]+\.\d{2})\s+basis\s+([\d,]+\.\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    lots.push({
      lotId: m[1],
      description: m[2].trim(),
      proceeds: Number(m[4].replace(/,/g, "")),
      basis: Number(m[5].replace(/,/g, "")),
    });
  }
  // Fallback for "basis (not reported)" style — still capture lot id presence
  const loose =
    /\b([A-Z]\d+)\s+[A-Za-z][^;]*?proceeds\s+([\d,]+\.\d{2})\s+basis/gi;
  while ((m = loose.exec(content)) !== null) {
    if (!lots.some((l) => l.lotId === m![1])) {
      lots.push({
        lotId: m[1],
        description: "",
        proceeds: Number(m[2].replace(/,/g, "")),
        basis: Number.NaN,
      });
    }
  }
  return lots;
}

/**
 * Reconcile printed lots on partially extracted brokerage pages with extractions
 * and return lines. Missing printed lots (e.g. M18) become completeness fails.
 */
export function runPageCompleteness(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult {
  const findings: CheckFinding[] = [];
  const inputRefs: string[] = [];
  const version = getPacket().return_versions.find((v) => v.version === ctx.version);
  if (!version) {
    return {
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "not_applicable",
      summary: "Version missing",
      findings: [],
      inputRefs: [],
    };
  }

  // Focus on corrected Meridian statement when available; else D30
  const candidates = ["D31", "D30"];
  for (const docId of candidates) {
    const doc = getDocument(docId);
    if (!doc || !documentAvailableAt(doc, ctx.asOf)) continue;
    if (doc.extraction.status !== "partial") continue;

    for (const page of doc.pages) {
      const printedLots = parsePrintedLots(page.printed_content);
      if (!printedLots.length) continue;
      inputRefs.push(`doc:${docId}#page${page.page}`);

      const extracted = getExtractedForDocument(docId).filter(
        (e) => e.page === page.page,
      );
      const extractedLotIds = new Set(
        extracted
          .map((e) => {
            const m = /^([A-Z]\d+)/.exec(e.field);
            return m ? m[1] : null;
          })
          .filter((x): x is string => Boolean(x)),
      );

      const returnLotIds = new Set(
        version.lines
          .map((l) => {
            const m = /\.(M\d+|N\d+|X\d+|C\d+)$/.exec(l.key);
            return m ? m[1] : null;
          })
          .filter((x): x is string => Boolean(x)),
      );

      for (const lot of printedLots) {
        const inExtraction = extractedLotIds.has(lot.lotId);
        // Match by lot identifier only — security names can collide across lots.
        const inReturn =
          returnLotIds.has(lot.lotId) ||
          version.lines.some(
            (l) =>
              l.key.endsWith(`.${lot.lotId}`) ||
              new RegExp(`\\b${lot.lotId}\\b`).test(l.label),
          );

        if (!inExtraction && !inReturn) {
          const fingerprint = `${RULE_ID}:doc:${docId}#page${page.page}:${lot.lotId}`;
          const pageRef = `doc:${docId}#page${page.page}`;
          findings.push({
            id: fingerprint,
            catalogId: catalogIdFor(fingerprint),
            checkId: RULE_ID,
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            status: "fail",
            title: `Printed lot ${lot.lotId} omitted from extraction and return`,
            explanation: `${docId} page ${page.page} prints lot ${lot.lotId} (proceeds ${Number.isFinite(lot.proceeds) ? lot.proceeds.toFixed(2) : "—"}, basis ${Number.isFinite(lot.basis) ? lot.basis.toFixed(2) : "—"}) but no extraction field or Form 8949 line references it.`,
            actual: {
              kind: "text",
              value: null,
              display: "missing",
            },
            expected: {
              kind: "money",
              value: lot.proceeds,
              display: `lot ${lot.lotId} proceeds ${displayValue("money", lot.proceeds)}`,
            },
            evidenceRefs: [pageRef, docId],
            evidenceHrefs: [
              documentHref(docId, page.page, { version: ctx.version }),
            ],
            affectedVersions: [ctx.version],
            affectedClaims: [],
            asOf: ctx.asOf,
            evidenceAvailable: true,
            earliestEvidenceAt: earliestEvidenceInstant([docId]),
            nuance: "missing_support",
          });
        }
      }
    }
  }

  return {
    checkId: RULE_ID,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    status: findings.length ? "fail" : "pass",
    summary: findings.length
      ? `${findings.length} printed lot(s) missing from extraction/return.`
      : "Partial pages: printed lots are represented in extraction or return.",
    findings,
    inputRefs: [...new Set(inputRefs)],
  };
}
