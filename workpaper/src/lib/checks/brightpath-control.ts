import "server-only";

import Decimal from "decimal.js";
import {
  DEFAULT_AS_OF,
  documentAvailableAt,
  extractedAvailableAt,
} from "@/lib/packet/availability";
import { getDocument, getExtractedValue } from "@/lib/packet/indexes";
import { getPacket } from "@/lib/packet/load";
import { displayValue } from "./format";
import type { CheckContext, CheckFinding, CheckResult } from "./types";

export const RULE_ID = "brightpath-positive-control";
export const RULE_VERSION = "1.0.0";

function parseSummary(content: string): {
  stProceeds: Decimal;
  stBasis: Decimal;
  ltProceeds: Decimal;
  ltBasis: Decimal;
  transactionCount: number;
} | null {
  const st = /short-term covered proceeds\s+([\d,]+\.\d{2})\s+basis\s+([\d,]+\.\d{2})/i.exec(
    content,
  );
  const lt = /long-term covered proceeds\s+([\d,]+\.\d{2})\s+basis\s+([\d,]+\.\d{2})/i.exec(
    content,
  );
  const count = /(\d+)\s+transactions/i.exec(content);
  if (!st || !lt || !count) return null;
  return {
    stProceeds: new Decimal(st[1].replace(/,/g, "")),
    stBasis: new Decimal(st[2].replace(/,/g, "")),
    ltProceeds: new Decimal(lt[1].replace(/,/g, "")),
    ltBasis: new Decimal(lt[2].replace(/,/g, "")),
    transactionCount: Number(count[1]),
  };
}

/**
 * Positive control: Brightpath (D74) 260 lots foot to the printed summary and
 * each v3 lot gain equals cited proceeds − basis (+ wash when present).
 */
export function runBrightpathPositiveControl(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult {
  const findings: CheckFinding[] = [];
  const inputRefs: string[] = ["D74"];
  const doc = getDocument("D74");
  if (!doc || !documentAvailableAt(doc, ctx.asOf)) {
    return {
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "not_applicable",
      summary: "Brightpath document unavailable at as-of.",
      findings: [],
      inputRefs,
    };
  }

  const summaryPage = doc.pages.find((p) => p.page === 1);
  const summary = summaryPage ? parseSummary(summaryPage.printed_content) : null;
  if (!summary) {
    return {
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "needs_review",
      summary: "Could not parse Brightpath printed summary.",
      findings: [],
      inputRefs,
    };
  }

  const version = getPacket().return_versions.find((v) => v.version === ctx.version);
  if (!version) {
    return {
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "not_applicable",
      summary: "Version missing",
      findings: [],
      inputRefs,
    };
  }

  const xLots = version.lines.filter((l) =>
    /^F8949\.[AD]\.X\d+$/.test(l.key),
  );
  inputRefs.push(...xLots.map((l) => l.key));

  if (xLots.length !== summary.transactionCount) {
    findings.push({
      id: `${RULE_ID}:count`,
      catalogId: null,
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "fail",
      title: "Brightpath lot count disagrees with printed summary",
      explanation: `Return has ${xLots.length} X lots; summary prints ${summary.transactionCount} transactions.`,
      actual: {
        kind: "count",
        value: xLots.length,
        display: displayValue("count", xLots.length),
      },
      expected: {
        kind: "count",
        value: summary.transactionCount,
        display: displayValue("count", summary.transactionCount),
      },
      evidenceRefs: ["D74"],
      evidenceHrefs: [],
      affectedVersions: [ctx.version],
      affectedClaims: [],
      asOf: ctx.asOf,
      evidenceAvailable: true,
      earliestEvidenceAt: doc.received_at,
      nuance: "discrepancy",
    });
  }

  let stProceeds = new Decimal(0);
  let stBasis = new Decimal(0);
  let ltProceeds = new Decimal(0);
  let ltBasis = new Decimal(0);
  let calcMismatches = 0;

  for (const line of xLots) {
    const label = line.label;
    const proceedsM = /proceeds\s+([\d,]+\.\d+)/i.exec(label);
    const basisM = /basis\s+([\d,]+\.\d+)/i.exec(label);
    const washM =
      /adjustment\s+W\s+([\d,]+\.\d+)/i.exec(label) ||
      /wash[^0-9]*([\d,]+\.\d+)/i.exec(label);
    const term = /short-term/i.test(label)
      ? "short"
      : /long-term/i.test(label)
        ? "long"
        : line.key.includes(".A.")
          ? "short"
          : "long";

    if (!proceedsM || !basisM) {
      calcMismatches += 1;
      continue;
    }
    const proceeds = new Decimal(proceedsM[1].replace(/,/g, ""));
    const basis = new Decimal(basisM[1].replace(/,/g, ""));
    const wash = washM ? new Decimal(washM[1].replace(/,/g, "")) : new Decimal(0);
    // Engine: proceeds − basis + code-W adjustment (disallowed wash sale loss)
    const expectedGain = proceeds.minus(basis).plus(wash);
    const actual = new Decimal(line.value as number);
    if (!expectedGain.toDecimalPlaces(2).equals(actual.toDecimalPlaces(2))) {
      // Also verify against cited extracted inputs when available
      const src = (line.sources ?? [])
        .map((id) => getExtractedValue(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .filter((e) => extractedAvailableAt(e, ctx.asOf));
      inputRefs.push(...src.map((e) => e.id));
      calcMismatches += 1;
    }

    if (term === "short") {
      stProceeds = stProceeds.plus(proceeds);
      stBasis = stBasis.plus(basis);
    } else {
      ltProceeds = ltProceeds.plus(proceeds);
      ltBasis = ltBasis.plus(basis);
    }
  }

  const footOk =
    stProceeds.toDecimalPlaces(2).equals(summary.stProceeds.toDecimalPlaces(2)) &&
    stBasis.toDecimalPlaces(2).equals(summary.stBasis.toDecimalPlaces(2)) &&
    ltProceeds.toDecimalPlaces(2).equals(summary.ltProceeds.toDecimalPlaces(2)) &&
    ltBasis.toDecimalPlaces(2).equals(summary.ltBasis.toDecimalPlaces(2));

  if (!footOk) {
    findings.push({
      id: `${RULE_ID}:footing`,
      catalogId: null,
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "fail",
      title: "Brightpath lot footing disagrees with printed summary",
      explanation: `Summed lots ST ${stProceeds}/${stBasis} LT ${ltProceeds}/${ltBasis} vs summary ST ${summary.stProceeds}/${summary.stBasis} LT ${summary.ltProceeds}/${summary.ltBasis}.`,
      actual: {
        kind: "text",
        value: {
          stProceeds: stProceeds.toNumber(),
          stBasis: stBasis.toNumber(),
          ltProceeds: ltProceeds.toNumber(),
          ltBasis: ltBasis.toNumber(),
        },
        display: "lot footing",
      },
      expected: {
        kind: "text",
        value: {
          stProceeds: summary.stProceeds.toNumber(),
          stBasis: summary.stBasis.toNumber(),
          ltProceeds: summary.ltProceeds.toNumber(),
          ltBasis: summary.ltBasis.toNumber(),
        },
        display: "printed summary",
      },
      evidenceRefs: ["D74"],
      evidenceHrefs: [],
      affectedVersions: [ctx.version],
      affectedClaims: [],
      asOf: ctx.asOf,
      evidenceAvailable: true,
      earliestEvidenceAt: doc.received_at,
      nuance: "discrepancy",
    });
  }

  if (calcMismatches > 0) {
    findings.push({
      id: `${RULE_ID}:lot-arith`,
      catalogId: null,
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "fail",
      title: "Brightpath lot arithmetic mismatches",
      explanation: `${calcMismatches} lot(s) where engine value ≠ proceeds − basis (+ wash).`,
      actual: {
        kind: "count",
        value: calcMismatches,
        display: displayValue("count", calcMismatches),
      },
      expected: { kind: "count", value: 0, display: "0" },
      evidenceRefs: ["D74"],
      evidenceHrefs: [],
      affectedVersions: [ctx.version],
      affectedClaims: [],
      asOf: ctx.asOf,
      evidenceAvailable: true,
      earliestEvidenceAt: doc.received_at,
      nuance: "discrepancy",
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: `${RULE_ID}:pass`,
      catalogId: null,
      checkId: RULE_ID,
      ruleId: RULE_ID,
      ruleVersion: RULE_VERSION,
      status: "pass",
      title: "Brightpath lots reconcile to printed summary",
      explanation: `All ${xLots.length} Brightpath lots foot to D74 summary proceeds/basis and agree with lot arithmetic on ${ctx.version}.`,
      actual: {
        kind: "count",
        value: xLots.length,
        display: displayValue("count", xLots.length),
      },
      expected: {
        kind: "count",
        value: summary.transactionCount,
        display: displayValue("count", summary.transactionCount),
      },
      evidenceRefs: ["D74"],
      evidenceHrefs: [],
      affectedVersions: [ctx.version],
      affectedClaims: xLots.slice(0, 3).map((l) => l.key),
      asOf: ctx.asOf,
      evidenceAvailable: true,
      earliestEvidenceAt: doc.received_at,
      nuance: "positive_control",
    });
  }

  return {
    checkId: RULE_ID,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    status: findings.some((f) => f.status === "fail") ? "fail" : "pass",
    summary: findings.some((f) => f.status === "fail")
      ? "Brightpath positive control failed."
      : `Brightpath positive control passed (${xLots.length} lots).`,
    findings,
    inputRefs: [...new Set(inputRefs)],
  };
}
