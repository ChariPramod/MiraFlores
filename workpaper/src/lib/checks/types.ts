export type CheckStatus =
  | "pass"
  | "fail"
  | "needs_review"
  | "not_applicable";

export type FindingValueKind =
  | "money"
  | "ein"
  | "text"
  | "quantity"
  | "count"
  | "unknown";

export type CheckFinding = {
  /** Stable evidence-derived id (not a hardcoded anomaly label). */
  id: string;
  /** Optional PLAN.md catalog cross-reference when fingerprint matches. */
  catalogId: string | null;
  checkId: string;
  ruleId: string;
  ruleVersion: string;
  status: CheckStatus;
  title: string;
  explanation: string;
  actual: { kind: FindingValueKind; value: unknown; display: string };
  expected: { kind: FindingValueKind; value: unknown; display: string };
  evidenceRefs: string[];
  evidenceHrefs: string[];
  affectedVersions: string[];
  affectedClaims: string[];
  asOf: string;
  evidenceAvailable: boolean;
  earliestEvidenceAt: string | null;
  /** Distinct from fail: blank/zero/missing/unresolved/judgment. */
  nuance:
    | "discrepancy"
    | "missing_support"
    | "duplicate"
    | "blank_vs_supported"
    | "positive_control"
    | "unresolved"
    | "judgment"
    | "none";
};

export type CheckResult = {
  checkId: string;
  ruleId: string;
  ruleVersion: string;
  status: CheckStatus;
  summary: string;
  findings: CheckFinding[];
  inputRefs: string[];
};

export type CheckContext = {
  version: string;
  asOf: string;
};
