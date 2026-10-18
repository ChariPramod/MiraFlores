import "server-only";

import Decimal from "decimal.js";
import {
  DEFAULT_AS_OF,
  earliestEvidenceInstant,
  extractedAvailableAt,
} from "@/lib/packet/availability";
import { getExtractedValue, getLine } from "@/lib/packet/indexes";
import { getPacket } from "@/lib/packet/load";
import { claimHrefRequired, documentHref } from "@/lib/navigation/href";
import { catalogIdFor } from "./catalog";
import { displayValue } from "./format";
import type { CheckContext, CheckFinding, CheckResult } from "./types";

export const RULE_ID = "duplicate-interest";
export const RULE_VERSION = "1.0.0";

function tokenizeIssuer(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/**
 * Flag duplicate recognition of the same interest amount across Schedule B lines
 * when payer tokens overlap and source documents describe the same economic item.
 */
export function runDuplicateInterest(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult {
  const version = getPacket().return_versions.find((v) => v.version === ctx.version);
  const findings: CheckFinding[] = [];
  const inputRefs: string[] = [];
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

  const interestLines = version.lines.filter(
    (l) =>
      l.key.startsWith("SchB.1.") &&
      typeof l.value === "number" &&
      (l.sources?.length ?? 0) > 0,
  );

  for (let i = 0; i < interestLines.length; i += 1) {
    for (let j = i + 1; j < interestLines.length; j += 1) {
      const a = interestLines[i];
      const b = interestLines[j];
      const amountA = new Decimal(a.value as number);
      const amountB = new Decimal(b.value as number);
      if (!amountA.equals(amountB) || amountA.isZero()) continue;

      const tokensA = tokenizeIssuer(a.label);
      const tokensB = tokenizeIssuer(b.label);
      const score = overlapScore(tokensA, tokensB);
      // Require shared institutional tokens (e.g. northlake) — not generic "interest"
      const sharedBank =
        (tokensA.has("northlake") && tokensB.has("northlake")) ||
        (tokensA.has("meridian") && tokensB.has("meridian"));
      if (!sharedBank && score < 2) continue;

      const srcA = (a.sources ?? []).filter((id) => {
        const ev = getExtractedValue(id);
        return ev && extractedAvailableAt(ev, ctx.asOf);
      });
      const srcB = (b.sources ?? []).filter((id) => {
        const ev = getExtractedValue(id);
        return ev && extractedAvailableAt(ev, ctx.asOf);
      });
      if (!srcA.length || !srcB.length) continue;

      // Distinct source documents — same amount counted from two 1099s
      const docsA = new Set(
        srcA.map((id) => getExtractedValue(id)!.document_id),
      );
      const docsB = new Set(
        srcB.map((id) => getExtractedValue(id)!.document_id),
      );
      const distinctDocs = [...docsA].every((d) => !docsB.has(d));
      if (!distinctDocs) continue;

      inputRefs.push(a.key, b.key, ...srcA, ...srcB);
      const pairKey = [a.key, b.key].sort().join("+");
      const fingerprint = `${RULE_ID}:${pairKey}`;
      const evidenceRefs = [...srcA, ...srcB, a.key, b.key];

      findings.push({
        id: fingerprint,
        catalogId: catalogIdFor(fingerprint),
        checkId: RULE_ID,
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        status: "fail",
        title: `Duplicate interest amount on ${a.key} and ${b.key}`,
        explanation: `Both lines report ${amountA.toFixed(2)} from overlapping Northlake interest sources on distinct documents (${[...docsA].join(",")} vs ${[...docsB].join(",")}).`,
        actual: {
          kind: "money",
          value: amountA.times(2).toNumber(),
          display: displayValue("money", amountA.times(2).toNumber()),
        },
        expected: {
          kind: "money",
          value: amountA.toNumber(),
          display: displayValue("money", amountA.toNumber()),
        },
        evidenceRefs,
        evidenceHrefs: [
          claimHrefRequired(a.key, ctx.version),
          claimHrefRequired(b.key, ctx.version),
          ...srcA.map((id) => {
            const ev = getExtractedValue(id)!;
            return documentHref(ev.document_id, ev.page, {
              highlight: id,
              version: ctx.version,
              fromClaim: a.key,
            });
          }),
          ...srcB.map((id) => {
            const ev = getExtractedValue(id)!;
            return documentHref(ev.document_id, ev.page, {
              highlight: id,
              version: ctx.version,
              fromClaim: b.key,
            });
          }),
        ],
        affectedVersions: [ctx.version],
        affectedClaims: [a.key, b.key],
        asOf: ctx.asOf,
        evidenceAvailable: true,
        earliestEvidenceAt: earliestEvidenceInstant(evidenceRefs),
        nuance: "duplicate",
      });

      getLine(a.key, ctx.version);
      getLine(b.key, ctx.version);
    }
  }

  return {
    checkId: RULE_ID,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    status: findings.length ? "fail" : "pass",
    summary: findings.length
      ? `${findings.length} duplicate interest pair(s).`
      : "No duplicate interest pairs detected.",
    findings,
    inputRefs: [...new Set(inputRefs)],
  };
}
