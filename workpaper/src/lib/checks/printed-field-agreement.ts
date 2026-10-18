import "server-only";

import { locatorForExtractedValue } from "@/lib/documents/renderer";
import {
  DEFAULT_AS_OF,
  earliestEvidenceInstant,
  extractedAvailableAt,
  refAvailableAt,
} from "@/lib/packet/availability";
import { getPacket } from "@/lib/packet/load";
import { getLinesUsingSource } from "@/lib/packet/indexes";
import { catalogIdFor } from "./catalog";
import { displayValue } from "./format";
import type { CheckContext, CheckFinding, CheckResult } from "./types";
import { documentHref } from "@/lib/navigation/href";

export const RULE_ID = "printed-field-agreement";
export const RULE_VERSION = "1.0.0";

/**
 * Compare printed document tokens with extracted interpretation for identity fields.
 * Derives mismatches from anchors — does not hardcode provider names or EINs.
 */
export function runPrintedFieldAgreement(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult {
  const packet = getPacket();
  const findings: CheckFinding[] = [];
  const inputRefs: string[] = [];

  const einExtractions = packet.extracted_values.filter(
    (ev) =>
      ev.value_type === "ein" ||
      /ein|tax.?id/i.test(ev.field) ||
      /tax id|ein/i.test(ev.label),
  );

  for (const ev of einExtractions) {
    inputRefs.push(ev.id);
    if (!extractedAvailableAt(ev, ctx.asOf)) continue;

    const locator = locatorForExtractedValue(ev.id, ctx.asOf);
    if (!locator || locator.resolution === "unresolved") {
      findings.push({
        id: `${RULE_ID}:unresolved:${ev.id}`,
        catalogId: null,
        checkId: RULE_ID,
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        status: "needs_review",
        title: `Unresolved printed anchor for ${ev.label}`,
        explanation:
          "Could not locate a unique printed field for this extraction; not classified as a discrepancy.",
        actual: {
          kind: "ein",
          value: ev.value,
          display: displayValue("ein", ev.value),
        },
        expected: {
          kind: "ein",
          value: null,
          display: "exact field not located",
        },
        evidenceRefs: [ev.id, ev.document_id],
        evidenceHrefs: [
          documentHref(ev.document_id, ev.page, {
            highlight: ev.id,
            version: ctx.version,
          }),
        ],
        affectedVersions: [ctx.version],
        affectedClaims: [
          ...new Set(
            getLinesUsingSource(ev.id).map((r) =>
              r.includes(":") ? r.split(":")[1] : r,
            ),
          ),
        ],
        asOf: ctx.asOf,
        evidenceAvailable: true,
        earliestEvidenceAt: earliestEvidenceInstant([ev.id]),
        nuance: "unresolved",
      });
      continue;
    }

    if (locator.resolution === "resolved_mismatch") {
      const fingerprint = `${RULE_ID}:${ev.id}`;
      const printed = locator.highlightedText ?? locator.printedComparable;
      findings.push({
        id: fingerprint,
        catalogId: catalogIdFor(fingerprint),
        checkId: RULE_ID,
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        status: "fail",
        title: `Printed field disagrees with extraction (${ev.field})`,
        explanation: `Document ${ev.document_id} page ${ev.page} prints “${printed}” while extraction ${ev.id} reads “${ev.text_as_read || ev.value}” at confidence ${ev.confidence}.`,
        actual: {
          kind: "ein",
          value: ev.value,
          display: displayValue("ein", ev.value),
        },
        expected: {
          kind: "ein",
          value: printed,
          display: String(printed),
        },
        evidenceRefs: [ev.id, ev.document_id],
        evidenceHrefs: [
          documentHref(ev.document_id, ev.page, {
            highlight: ev.id,
            version: ctx.version,
          }),
        ],
        affectedVersions: [ctx.version],
        affectedClaims: [
          ...new Set(
            getLinesUsingSource(ev.id).map((r) =>
              r.includes(":") ? r.split(":")[1] : r,
            ),
          ),
        ],
        asOf: ctx.asOf,
        evidenceAvailable: refAvailableAt(ev.id, ctx.asOf),
        earliestEvidenceAt: earliestEvidenceInstant([ev.id]),
        nuance: "discrepancy",
      });
    }
  }

  const status = findings.some((f) => f.status === "fail")
    ? "fail"
    : findings.some((f) => f.status === "needs_review")
      ? "needs_review"
      : "pass";

  return {
    checkId: RULE_ID,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    status,
    summary:
      status === "pass"
        ? "All anchored EIN/tax-ID extractions agree with printed tokens."
        : `Printed-field agreement: ${findings.filter((f) => f.status === "fail").length} mismatch(es).`,
    findings,
    inputRefs,
  };
}
