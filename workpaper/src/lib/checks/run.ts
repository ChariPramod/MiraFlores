import "server-only";

import { DEFAULT_AS_OF } from "@/lib/packet/availability";
import { runBrightpathPositiveControl } from "./brightpath-control";
import { runDuplicateInterest } from "./duplicate-interest";
import { runPageCompleteness } from "./page-completeness";
import { runPrintedFieldAgreement } from "./printed-field-agreement";
import { runSupplementalBasis } from "./supplemental-basis";
import type { CheckContext, CheckFinding, CheckResult } from "./types";

export function runAllChecks(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckResult[] {
  return [
    runPrintedFieldAgreement(ctx),
    runSupplementalBasis(ctx),
    runDuplicateInterest(ctx),
    runPageCompleteness(ctx),
    runBrightpathPositiveControl(ctx),
  ];
}

export function collectFindings(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): CheckFinding[] {
  return runAllChecks(ctx).flatMap((r) => r.findings);
}

export function findingsInbox(
  ctx: CheckContext = { version: "v3", asOf: DEFAULT_AS_OF },
): {
  asOf: string;
  version: string;
  checks: CheckResult[];
  open: CheckFinding[];
  passedControls: CheckFinding[];
  byCatalog: Record<string, CheckFinding[]>;
} {
  const checks = runAllChecks(ctx);
  const all = checks.flatMap((c) => c.findings);
  const open = all.filter((f) => f.status === "fail" || f.status === "needs_review");
  const passedControls = all.filter(
    (f) => f.status === "pass" && f.nuance === "positive_control",
  );
  const byCatalog: Record<string, CheckFinding[]> = {};
  for (const f of all) {
    if (!f.catalogId) continue;
    byCatalog[f.catalogId] = byCatalog[f.catalogId] ?? [];
    byCatalog[f.catalogId].push(f);
  }
  return { asOf: ctx.asOf, version: ctx.version, checks, open, passedControls, byCatalog };
}
