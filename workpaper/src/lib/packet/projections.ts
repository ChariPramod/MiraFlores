import "server-only";

import {
  locatorForExtractedValue,
  sideBySideValues,
} from "@/lib/documents/renderer";
import { formatMoney, formatNumber } from "@/lib/format/money";
import {
  claimHrefRequired,
  documentHref,
} from "@/lib/navigation/href";
import {
  DEFAULT_AS_OF,
  refAvailableAt,
} from "@/lib/packet/availability";
import {
  getConsumersOfLine,
  getLine,
  getReturnVersion,
} from "./indexes";
import { expandCalculation, findCalculationPath, resolveRef } from "./resolve";
import type { EvidenceLocator, ReturnLine } from "./types";
import { getPacket, getPacketIntegrity } from "./load";
import type { WorkspaceProjection } from "@/lib/events/types";
import { materialDependents, scopeKey } from "@/lib/events/fingerprint";

export type SourceEvidenceDto = {
  ref: string;
  kind: string;
  label: string;
  extractedValue: unknown;
  textAsRead: string | null;
  confidence: number | null;
  documentId: string | null;
  page: number | null;
  field: string | null;
  printedSnippet: string | null;
  agreement: string | null;
  locator: EvidenceLocator | null;
  href: string | null;
  available: boolean;
};

export type ClaimWorkingDto = {
  revision: number;
  branchSequence: number;
  supportedBasisDisplay: string | null;
  workingValueDisplay: string;
  workingGainDisplay: string | null;
  originalBasisDisplay: string | null;
  adjustmentReason: string | null;
  adjustmentEvidence: string[];
  estimatedFederalEffectDisplay: string | null;
  estimatedCaliforniaEffectDisplay: string | null;
  effectLimitations: string[];
  effectMethod: string | null;
  fullyRecomputed: false;
  partnerApprovalRequired: boolean;
  partnerApprovalSatisfied: boolean;
  signoffStatus: string | null;
  signoffLevel: string | null;
  signoffReopenReason: string | null;
  verificationStatus: string | null;
  notes: Array<{
    noteId: string;
    text: string;
    blocking: boolean;
    resolved: boolean;
  }>;
  adjustmentEventId: string | null;
};

export type ClaimDto = {
  key: string;
  version: string;
  jurisdiction: string;
  form: string;
  line: string;
  label: string;
  engineValue: unknown;
  engineValueDisplay: string;
  rule: string;
  ruleExplanation: string | null;
  inputs: Array<{ key: string; label: string; valueDisplay: string }>;
  sources: SourceEvidenceDto[];
  usedIn: Array<{ key: string; label: string }>;
  pathFromCapitalGain: string[] | null;
  working: ClaimWorkingDto | null;
};

function personName(person: Record<string, unknown> | undefined): string {
  if (!person) return "";
  const name =
    (person.name as string | undefined) ||
    (person.legal_name as string | undefined) ||
    (person.display_name as string | undefined) ||
    "";
  return name;
}

function sourceDto(
  ref: string,
  version: string,
  fromClaim: string,
  asOf: string,
): SourceEvidenceDto {
  const available = refAvailableAt(ref, asOf);
  if (!available) {
    return {
      ref,
      kind: "unavailable",
      label: `Not available as of ${asOf.slice(0, 10)}`,
      extractedValue: null,
      textAsRead: null,
      confidence: null,
      documentId: null,
      page: null,
      field: null,
      printedSnippet: null,
      agreement: null,
      locator: null,
      href: null,
      available: false,
    };
  }

  const resolved = resolveRef(ref, { version });
  if (resolved.kind === "extracted_value") {
    const ev = resolved.value;
    const side = sideBySideValues(ev, asOf);
    const locator = locatorForExtractedValue(ev.id, asOf);
    return {
      ref,
      kind: "extracted_value",
      label: ev.label,
      extractedValue: ev.value,
      textAsRead: ev.text_as_read,
      confidence: ev.confidence,
      documentId: ev.document_id,
      page: ev.page,
      field: ev.field,
      printedSnippet: side.printedSnippet,
      agreement: side.agreement,
      locator,
      href: documentHref(ev.document_id, ev.page, {
        highlight: ev.id,
        version,
        fromClaim,
      }),
      available: true,
    };
  }
  if (resolved.kind === "prior_year") {
    return {
      ref,
      kind: "prior_year",
      label: `Prior year ${resolved.pointer}`,
      extractedValue: resolved.value,
      textAsRead: null,
      confidence: null,
      documentId: null,
      page: null,
      field: null,
      printedSnippet: null,
      agreement: null,
      locator: null,
      href: null,
      available: true,
    };
  }
  if (resolved.kind === "missing") {
    return {
      ref,
      kind: "missing",
      label: resolved.reason,
      extractedValue: null,
      textAsRead: null,
      confidence: null,
      documentId: null,
      page: null,
      field: null,
      printedSnippet: null,
      agreement: null,
      locator: null,
      href: null,
      available: true,
    };
  }
  return {
    ref,
    kind: resolved.kind,
    label: ref,
    extractedValue: "value" in resolved ? resolved.value : null,
    textAsRead: null,
    confidence: null,
    documentId: null,
    page: null,
    field: null,
    printedSnippet: null,
    agreement: null,
    locator: null,
    href: null,
    available: true,
  };
}

export function projectClaim(
  lineKey: string,
  version = "v3",
  asOf: string = DEFAULT_AS_OF,
  projection: WorkspaceProjection | null = null,
): ClaimDto | null {
  const line = getLine(lineKey, version);
  if (!line) return null;
  const packet = getPacket();
  const ruleExplanation = packet.engine_reference.rules[line.rule] ?? null;

  const inputs = (line.inputs ?? []).map((key) => {
    const inputLine = getLine(key, version);
    return {
      key,
      label: inputLine?.label ?? key,
      valueDisplay: formatClaimValue(inputLine),
    };
  });

  const sources = (line.sources ?? []).map((ref) =>
    sourceDto(ref, version, lineKey, asOf),
  );

  const usedIn = getConsumersOfLine(lineKey, version).map((key) => {
    const consumer = getLine(key, version);
    return { key, label: consumer?.label ?? key };
  });

  const pathFromCapitalGain =
    lineKey === "F1040.7"
      ? ["F1040.7"]
      : findCalculationPath("F1040.7", lineKey, version);

  const working = projection
    ? projectClaimWorking(lineKey, version, line, projection)
    : null;

  return {
    key: line.key,
    version,
    jurisdiction: line.jurisdiction,
    form: line.form,
    line: line.line,
    label: line.label,
    engineValue: line.value,
    engineValueDisplay: formatClaimValue(line),
    rule: line.rule,
    ruleExplanation,
    inputs,
    sources,
    usedIn,
    pathFromCapitalGain,
    working,
  };
}

function projectClaimWorking(
  lineKey: string,
  version: string,
  line: ReturnLine,
  projection: WorkspaceProjection,
): ClaimWorkingDto {
  const sk = scopeKey(version, lineKey);
  const adj = projection.adjustments[sk];
  const activeAdj = adj && !adj.reversed ? adj : null;
  const signoff = projection.signoffs[sk] ?? null;
  const verification = projection.verifications[sk] ?? null;
  const notes = projection.notes.filter(
    (n) => n.claimKey === lineKey && !n.resolved,
  );

  const engineDisplay = formatClaimValue(line);
  let workingValueDisplay = engineDisplay;
  let workingGainDisplay: string | null = null;
  let supportedBasisDisplay: string | null = null;
  let originalBasisDisplay: string | null = null;

  if (activeAdj?.field === "basis") {
    supportedBasisDisplay = formatMoney(activeAdj.effectiveValue);
    originalBasisDisplay = formatMoney(activeAdj.originalValue);
    if (activeAdj.workingGain !== undefined) {
      workingGainDisplay = formatMoney(activeAdj.workingGain);
      workingValueDisplay = formatMoney(activeAdj.workingGain);
    }
  } else if (activeAdj) {
    workingValueDisplay = formatMoney(activeAdj.effectiveValue);
  }

  return {
    revision: projection.claimRevisions[lineKey] ?? 0,
    branchSequence: projection.sequence,
    supportedBasisDisplay,
    workingValueDisplay,
    workingGainDisplay,
    originalBasisDisplay,
    adjustmentReason: activeAdj?.reason ?? null,
    adjustmentEvidence: activeAdj?.evidenceRefs ?? [],
    estimatedFederalEffectDisplay:
      activeAdj?.estimatedFederalEffect != null
        ? formatMoney(activeAdj.estimatedFederalEffect)
        : null,
    estimatedCaliforniaEffectDisplay:
      activeAdj?.estimatedCaliforniaEffect != null
        ? formatMoney(activeAdj.estimatedCaliforniaEffect)
        : null,
    effectLimitations: activeAdj?.effectLimitations ?? [],
    effectMethod: activeAdj?.effectMethod ?? null,
    fullyRecomputed: false,
    partnerApprovalRequired: Object.values(projection.adjustments).some(a => !a.reversed && a.engineVersion === version && materialDependents(a.claimKey, version).includes(lineKey) && (Math.abs(a.estimatedFederalEffect ?? 0) > 1000 || Math.abs(a.estimatedCaliforniaEffect ?? 0) > 1000)),
    partnerApprovalSatisfied: signoff?.status === "active" && signoff.level === "partner",
    signoffStatus: signoff?.status ?? null,
    signoffLevel: signoff?.level ?? null,
    signoffReopenReason: signoff?.reopenReason ?? null,
    verificationStatus: verification?.open
      ? verification.conclusion
      : verification
        ? "invalidated"
        : null,
    notes: notes.map((n) => ({
      noteId: n.noteId,
      text: n.text,
      blocking: n.blocking,
      resolved: n.resolved,
    })),
    adjustmentEventId: activeAdj?.eventId ?? null,
  };
}

function formatClaimValue(line: ReturnLine | undefined): string {
  if (!line) return "—";
  if (typeof line.value === "number") {
    return formatMoney(line.value);
  }
  if (typeof line.value === "string" && /^-?\d+(\.\d+)?$/.test(line.value)) {
    return formatMoney(line.value);
  }
  return formatNumber(line.value);
}

export type CalcTreeDto = {
  key: string;
  label: string;
  valueDisplay: string;
  rule: string;
  ruleExplanation: string | null;
  cycle: boolean;
  children: CalcTreeDto[];
};

export function projectCalculationTree(
  lineKey: string,
  version = "v3",
  maxDepth = 8,
): CalcTreeDto | null {
  const tree = expandCalculation(lineKey, {
    version,
    maxDepth,
    focusKey: lineKey,
  });
  if (!tree) return null;

  const mapNode = (node: NonNullable<typeof tree>): CalcTreeDto => ({
    key: node.line.key,
    label: node.line.label,
    valueDisplay: formatClaimValue(node.line),
    rule: node.line.rule,
    ruleExplanation: node.ruleExplanation,
    cycle: node.cycle,
    children: node.children.map(mapNode),
  });

  return mapNode(tree);
}

export type OverviewDto = {
  clientName: string;
  taxYear: number;
  filingStatus: string;
  firmName: string;
  version: string;
  computedAt: string;
  simulationDate: string;
  federal: Record<string, number>;
  california: Record<string, number>;
  documentCount: number;
  pageCount: number;
  lineCount: number;
  integrity: ReturnType<typeof getPacketIntegrity>;
  highlightClaims: Array<{
    key: string;
    label: string;
    valueDisplay: string;
    href: string;
  }>;
};

export function projectOverview(version = "v3"): OverviewDto {
  const packet = getPacket();
  const ret = getReturnVersion(version);
  const integrity = getPacketIntegrity();
  const taxpayer = packet.household.people.find((p) => p.role === "taxpayer");
  const spouse = packet.household.people.find((p) => p.role === "spouse");

  const highlightKeys = [
    "F1040.7",
    "F1040.11",
    "F1040.24",
    "F1040.37",
    "F8949.B.N1",
  ];

  return {
    clientName: [personName(taxpayer as never), personName(spouse as never)]
      .filter(Boolean)
      .join(" & "),
    taxYear: packet.household.tax_year,
    filingStatus: packet.household.filing_status,
    firmName: packet.firm.name,
    version: ret.version,
    computedAt: ret.computed_at,
    simulationDate: "2026-06-23",
    federal: ret.summary.federal,
    california: ret.summary.california,
    documentCount: integrity.documentCount,
    pageCount: integrity.pageCount,
    lineCount: ret.lines.length,
    integrity,
    highlightClaims: highlightKeys
      .map((key) => {
        const line = getLine(key, version);
        if (!line) return null;
        return {
          key,
          label: line.label,
          valueDisplay: formatClaimValue(line),
          href: claimHrefRequired(key, version),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

/** Safe document list — no full printed content dump. */
export function projectDocumentIndex(
  version = "v3",
  asOf: string = DEFAULT_AS_OF,
): Array<{
  id: string;
  title: string;
  documentType: string;
  pageCount: number;
  extractionStatus: string;
  taxYear: number;
  available: boolean;
  href: string;
}> {
  return getPacket().documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    documentType: doc.document_type,
    pageCount: doc.page_count,
    extractionStatus: doc.extraction.status,
    taxYear: doc.tax_year,
    available: refAvailableAt(doc.id, asOf),
    href: documentHref(doc.id, 1, { version }),
  }));
}
