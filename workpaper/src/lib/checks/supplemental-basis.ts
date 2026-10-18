import "server-only";

import Decimal from "decimal.js";
import { locatorForExtractedValue } from "@/lib/documents/renderer";
import {
  DEFAULT_AS_OF,
  earliestEvidenceInstant,
  extractedAvailableAt,
  documentAvailableAt,
} from "@/lib/packet/availability";
import { getDocument, getExtractedForDocument, getLine } from "@/lib/packet/indexes";
import { getPacket } from "@/lib/packet/load";
import { claimHrefRequired, documentHref } from "@/lib/navigation/href";
import { catalogIdFor } from "./catalog";
import { displayValue, moneyOrBlank } from "./format";
import type { CheckContext, CheckFinding, CheckResult } from "./types";

export const RULE_ID = "supplemental-basis";
export const RULE_VERSION = "1.0.0";

type LotKey = {
  acquired: string;
  sold: string;
  shares: number | null;
};

function parseIso(d: string): string {
  // Normalize 02/15/2025 and 2025-02-15 → 2025-02-15
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return d.slice(0, 10);
}

function parseSupplementalLots(printed: string): Array<{
  lotId: string;
  acquired: string;
  sold: string;
  shares: number;
  adjustedBasis: number;
}> {
  const lots: Array<{
    lotId: string;
    acquired: string;
    sold: string;
    shares: number;
    adjustedBasis: number;
  }> = [];
  const re =
    /Lot\s+(RSU-\d+):\s*([\d.]+)\s*sh\s+acquired\s+(\d{2}\/\d{2}\/\d{4}).*?adjusted basis\s+([\d,]+\.\d{2}).*?sold\s+(\d{2}\/\d{2}\/\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(printed)) !== null) {
    lots.push({
      lotId: m[1],
      shares: Number(m[2]),
      acquired: parseIso(m[3]),
      adjustedBasis: Number(m[4].replace(/,/g, "")),
      sold: parseIso(m[5]),
    });
  }
  return lots;
}

function parseLineLot(label: string): LotKey | null {
  const m =
    /acquired\s+(\d{4}-\d{2}-\d{2}),\s*sold\s+(\d{4}-\d{2}-\d{2}).*?proceeds\s+([\d,]+\.?\d*).*?basis\s+([\d,]+\.?\d*|0\.00)/i.exec(
      label,
    );
  if (!m) return null;
  return {
    acquired: m[1],
    sold: m[2],
    shares: null,
  };
}

function basisFromSources(
  sources: string[],
  asOf: string,
): { value: unknown; blank: boolean; refs: string[] } {
  const basisEvs = sources
    .map((id) => getPacket().extracted_values.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .filter((e) => /basis/i.test(e.field) || /basis/i.test(e.label))
    .filter((e) => extractedAvailableAt(e, asOf));

  if (basisEvs.length === 0) {
    return { value: null, blank: true, refs: [] };
  }
  const ev = basisEvs[0];
  const blank =
    (ev.text_as_read ?? "") === "" ||
    ev.value === "" ||
    ev.value === 0 ||
    ev.value === 0.0;
  return { value: ev.value, blank, refs: basisEvs.map((e) => e.id) };
}

/**
 * Match supplemental stock-plan lots to return sale lines by acquisition/sale dates.
 * Flag when the return cites blank/zero broker basis while supplemental basis exists.
 */
export function runSupplementalBasis(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult {
  const findings: CheckFinding[] = [];
  const inputRefs: string[] = [];
  const d11 = getDocument("D11");
  if (!d11 || !documentAvailableAt(d11, ctx.asOf)) {
    return {
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "not_applicable",
      summary: "Supplemental stock-plan statement not available at as-of.",
      findings: [],
      inputRefs: ["D11"],
    };
  }

  const printed = d11.pages.map((p) => p.printed_content).join(" ");
  const supplemental = parseSupplementalLots(printed);
  inputRefs.push("D11");
  for (const lot of supplemental) {
    const evs = getExtractedForDocument("D11").filter((e) =>
      e.field.startsWith(lot.lotId),
    );
    inputRefs.push(...evs.map((e) => e.id));
  }

  const saleLines = getPacket()
    .return_versions.find((v) => v.version === ctx.version)
    ?.lines.filter((l) => l.key.startsWith("F8949.") && /RSU/i.test(l.label)) ?? [];

  for (const line of saleLines) {
    const parsed = parseLineLot(line.label);
    if (!parsed) continue;
    const match = supplemental.find(
      (s) => s.acquired === parsed.acquired && s.sold === parsed.sold,
    );
    if (!match) continue;

    const basis = basisFromSources(line.sources ?? [], ctx.asOf);
    inputRefs.push(...basis.refs, line.key);

    const unsupportedZero =
      basis.blank &&
      match.adjustedBasis > 0 &&
      new Decimal(match.adjustedBasis).greaterThan(0);

    if (unsupportedZero) {
      const fingerprint = `${RULE_ID}:${line.key}`;
      const basisEv = basis.refs[0];
      const suppEv = getExtractedForDocument("D11").find(
        (e) =>
          e.field.startsWith(match.lotId) && /basis/i.test(e.field),
      );
      const evidenceRefs = [
        ...basis.refs,
        ...(suppEv ? [suppEv.id] : []),
        "D11",
        line.key,
      ];
      findings.push({
        id: fingerprint,
        catalogId: catalogIdFor(fingerprint),
        checkId: RULE_ID,
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        status: "fail",
        title: `Supplemental basis omitted for ${line.key}`,
        explanation: `Return line ${line.key} uses blank/zero broker basis while D11 lot ${match.lotId} prints adjusted basis ${match.adjustedBasis.toFixed(2)} for the same acquisition/sale dates.`,
        actual: {
          kind: "money",
          value: basis.value,
          display: moneyOrBlank(basis.value),
        },
        expected: {
          kind: "money",
          value: match.adjustedBasis,
          display: displayValue("money", match.adjustedBasis),
        },
        evidenceRefs,
        evidenceHrefs: [
          claimHrefRequired(line.key, ctx.version),
          ...(basisEv
            ? [
                documentHref(
                  getPacket().extracted_values.find((e) => e.id === basisEv)!
                    .document_id,
                  getPacket().extracted_values.find((e) => e.id === basisEv)!
                    .page,
                  {
                    highlight: basisEv,
                    version: ctx.version,
                    fromClaim: line.key,
                  },
                ),
              ]
            : []),
          ...(suppEv
            ? [
                documentHref("D11", suppEv.page, {
                  highlight: suppEv.id,
                  version: ctx.version,
                  fromClaim: line.key,
                }),
              ]
            : [documentHref("D11", 2, { version: ctx.version, fromClaim: line.key })]),
        ],
        affectedVersions: [ctx.version],
        affectedClaims: [line.key],
        asOf: ctx.asOf,
        evidenceAvailable: true,
        earliestEvidenceAt: earliestEvidenceInstant(evidenceRefs),
        nuance: "blank_vs_supported",
      });

      // Touch locator so anchor identity is exercised for both sides
      if (basisEv) locatorForExtractedValue(basisEv, ctx.asOf);
      if (suppEv) locatorForExtractedValue(suppEv.id, ctx.asOf);
    }
  }

  // Ensure getLine path is warm for version
  getLine("F8949.B.N1", ctx.version);

  return {
    checkId: RULE_ID,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    status: findings.length ? "fail" : "pass",
    summary: findings.length
      ? `${findings.length} sale lot(s) omit available supplemental basis.`
      : "No unmatched zero-basis RSU lots against supplemental statement.",
    findings,
    inputRefs: [...new Set(inputRefs)],
  };
}
