import "server-only";

import { getByJsonPointer } from "./json-pointer";
import { getIndexes, getLine, getReturnVersion } from "./indexes";
import { getPacket } from "./load";
import type { ResolvedRef, ReturnLine } from "./types";

const EV_RE = /^ev-\d+$/;
const DOC_RE = /^D\d{2}$/;
const DOC_PAGE_RE = /^doc:(D\d{2})#page(\d+)$/;
const QA_RE = /^qa-\d+$/;
const MSG_RE = /^msg-\d+$/;
const CALL_RE = /^call-\d+$/;
const PY_RE = /^py:(\/.*)$/;
const AGENCY_RE = /^agency:(\/.*)$/;
const ASSET_RE = /^asset:(.+)$/;
const HOUSEHOLD_RE = /^household:(.+)$/;
const PARAM_RE = /^ref:param\.(.+)$/;
const FX_RE = /^ref:fx\.SEK\.(.+)$/;
const TIMELINE_RE = /^timeline:(.+)$/;
const VERSIONED_LINE_RE = /^(v[123]):(.+)$/;

export type ResolveOptions = {
  /** Default engine version for bare line keys and assets. */
  version?: string;
};

/**
 * Resolve every supported packet reference grammar.
 * Unknown values stay unknown; missing refs return `{ kind: "missing" }`.
 */
export function resolveRef(
  ref: string,
  options: ResolveOptions = {},
): ResolvedRef {
  const version = options.version ?? "v3";
  const indexes = getIndexes();
  const packet = getPacket();
  const trimmed = ref.trim();

  if (!trimmed) {
    return { kind: "missing", ref, reason: "Empty reference" };
  }

  if (EV_RE.test(trimmed)) {
    const value = indexes.extractedById.get(trimmed);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Extracted value not found" };
    }
    return { kind: "extracted_value", ref: trimmed, value };
  }

  if (DOC_RE.test(trimmed)) {
    const value = indexes.documentsById.get(trimmed);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Document not found" };
    }
    return { kind: "document", ref: trimmed, value };
  }

  const docPage = DOC_PAGE_RE.exec(trimmed);
  if (docPage) {
    const document = indexes.documentsById.get(docPage[1]);
    const page = Number(docPage[2]);
    if (!document) {
      return { kind: "missing", ref: trimmed, reason: "Document not found" };
    }
    if (!document.pages.some((p) => p.page === page)) {
      return {
        kind: "missing",
        ref: trimmed,
        reason: `Page ${page} not found on ${docPage[1]}`,
      };
    }
    return { kind: "document_page", ref: trimmed, document, page };
  }

  if (QA_RE.test(trimmed)) {
    const value = indexes.questionnaireById.get(trimmed);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Questionnaire answer not found" };
    }
    return { kind: "questionnaire", ref: trimmed, value };
  }

  if (MSG_RE.test(trimmed)) {
    const value = indexes.messagesById.get(trimmed);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Message not found" };
    }
    return { kind: "message", ref: trimmed, value };
  }

  if (CALL_RE.test(trimmed)) {
    const value = indexes.callNotesById.get(trimmed);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Call note not found" };
    }
    return { kind: "call_note", ref: trimmed, value };
  }

  const py = PY_RE.exec(trimmed);
  if (py) {
    const pointer = py[1];
    const value = getByJsonPointer(packet.prior_years, pointer);
    if (value === undefined) {
      return { kind: "missing", ref: trimmed, reason: "Prior-year pointer not found" };
    }
    return { kind: "prior_year", ref: trimmed, pointer, value };
  }

  const agency = AGENCY_RE.exec(trimmed);
  if (agency) {
    const pointer = agency[1];
    const value = getByJsonPointer(packet.tax_agency_records, pointer);
    if (value === undefined) {
      return { kind: "missing", ref: trimmed, reason: "Agency pointer not found" };
    }
    return { kind: "agency", ref: trimmed, pointer, value };
  }

  const asset = ASSET_RE.exec(trimmed);
  if (asset) {
    const assetId = asset[1];
    const keyed = indexes.assetsByVersionId.get(`${version}::${assetId}`);
    if (keyed) {
      return {
        kind: "asset",
        ref: trimmed,
        version,
        value: keyed as never,
      };
    }
    const prior = (packet.prior_years.asset_records as Array<{ asset_id: string }> | undefined)?.find(
      (a) => a.asset_id === assetId,
    );
    if (prior) {
      return { kind: "asset", ref: trimmed, value: prior as never };
    }
    return { kind: "missing", ref: trimmed, reason: "Asset not found" };
  }

  const household = HOUSEHOLD_RE.exec(trimmed);
  if (household) {
    const value = indexes.householdById.get(household[1]);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Household member not found" };
    }
    return { kind: "household", ref: trimmed, value: value as never };
  }

  const param = PARAM_RE.exec(trimmed);
  if (param) {
    const name = param[1];
    const value = getByJsonPointer(
      packet.engine_reference.parameters,
      `/${name.replace(/\./g, "/")}`,
    );
    // Also try direct key lookup for flat parameter names
    const direct =
      value !== undefined
        ? value
        : (packet.engine_reference.parameters as Record<string, unknown>)[name];
    if (direct === undefined) {
      return { kind: "missing", ref: trimmed, reason: "Parameter not found" };
    }
    return { kind: "param", ref: trimmed, name, value: direct };
  }

  const fx = FX_RE.exec(trimmed);
  if (fx) {
    const rateKey = fx[1];
    const fromEngine = getByJsonPointer(
      packet.engine_reference.parameters,
      `/fx/SEK/${rateKey}`,
    );
    const fromFx =
      (packet.fx_rates as { SEK_per_USD?: Record<string, unknown> }).SEK_per_USD?.[
        rateKey
      ];
    const value = fromEngine ?? fromFx;
    if (value === undefined) {
      return { kind: "missing", ref: trimmed, reason: "FX rate not found" };
    }
    return { kind: "fx", ref: trimmed, rateKey, value };
  }

  const timeline = TIMELINE_RE.exec(trimmed);
  if (timeline) {
    const value = indexes.timelineById.get(timeline[1]);
    if (!value) {
      return { kind: "missing", ref: trimmed, reason: "Timeline event not found" };
    }
    return { kind: "timeline", ref: trimmed, value };
  }

  const versioned = VERSIONED_LINE_RE.exec(trimmed);
  if (versioned) {
    const line = getLine(versioned[2], versioned[1]);
    if (!line) {
      return { kind: "missing", ref: trimmed, reason: "Versioned line not found" };
    }
    return { kind: "line", ref: trimmed, version: versioned[1], value: line };
  }

  // Bare return-line key (e.g. F1040.7, F8949.B.N1)
  const line = getLine(trimmed, version);
  if (line) {
    return { kind: "line", ref: trimmed, version, value: line };
  }

  return {
    kind: "missing",
    ref: trimmed,
    reason: "Unrecognized or unresolved reference",
  };
}

export function resolveMany(
  refs: string[],
  options?: ResolveOptions,
): ResolvedRef[] {
  return refs.map((ref) => resolveRef(ref, options));
}

export type CalculationNode = {
  line: ReturnLine;
  version: string;
  ruleExplanation: string | null;
  children: CalculationNode[];
  /** Detected cycle — children truncated. */
  cycle: boolean;
};

/**
 * Expand calculation inputs for a line. Stops on cycles.
 * Large fan-outs (e.g. 260 Brightpath lots) stay collapsed unless on a focus path.
 * Does not invent arithmetic; preserves incomplete lineage as declared.
 */
export function expandCalculation(
  lineKey: string,
  options: ResolveOptions & {
    maxDepth?: number;
    /** Prefer expanding ancestors of this key when fan-out is large. */
    focusKey?: string;
    /** Max direct children to expand before collapsing the rest. */
    maxFanout?: number;
  } = {},
): CalculationNode | null {
  const version = options.version ?? "v3";
  const maxDepth = options.maxDepth ?? 10;
  const maxFanout = options.maxFanout ?? 8;
  const focusKey = options.focusKey;
  const packet = getPacket();
  const rules = packet.engine_reference.rules;

  const focusPath = focusKey
    ? new Set(findCalculationPath(lineKey, focusKey, version) ?? [lineKey])
    : null;

  const walk = (
    key: string,
    depth: number,
    stack: Set<string>,
  ): CalculationNode | null => {
    const line = getLine(key, version);
    if (!line) return null;
    const cycle = stack.has(key);
    if (cycle || depth >= maxDepth) {
      return {
        line,
        version,
        ruleExplanation: rules[line.rule] ?? null,
        children: [],
        cycle: true,
      };
    }
    const nextStack = new Set(stack);
    nextStack.add(key);
    const inputs = line.inputs ?? [];
    let expandInputs = inputs;
    if (inputs.length > maxFanout) {
      if (focusPath) {
        const preferred = inputs.filter((input) => focusPath.has(input));
        const fillers = inputs
          .filter((input) => !focusPath.has(input))
          .slice(0, Math.max(0, maxFanout - preferred.length));
        expandInputs = [...preferred, ...fillers];
      } else {
        // Collapse lot totals: show children as leaves (no further recursion)
        return {
          line,
          version,
          ruleExplanation: rules[line.rule] ?? null,
          children: inputs.slice(0, maxFanout).map((input) => {
            const child = getLine(input, version);
            return {
              line: child ?? {
                key: input,
                jurisdiction: line.jurisdiction,
                form: line.form,
                line: input,
                label: `${inputs.length - maxFanout} more omitted from tree`,
                value: null,
                rule: "R-COLLAPSED",
                inputs: [],
                sources: [],
              },
              version,
              ruleExplanation:
                inputs.length > maxFanout
                  ? `${inputs.length} inputs — open a lot claim for full detail`
                  : null,
              children: [],
              cycle: false,
            };
          }),
          cycle: false,
        };
      }
    }
    const children = expandInputs
      .map((input) => walk(input, depth + 1, nextStack))
      .filter((n): n is CalculationNode => n !== null);
    if (inputs.length > expandInputs.length) {
      children.push({
        line: {
          key: `${key}…`,
          jurisdiction: line.jurisdiction,
          form: line.form,
          line: "…",
          label: `${inputs.length - expandInputs.length} more inputs not expanded`,
          value: null,
          rule: "R-COLLAPSED",
          inputs: [],
          sources: [],
        },
        version,
        ruleExplanation: null,
        children: [],
        cycle: false,
      });
    }
    return {
      line,
      version,
      ruleExplanation: rules[line.rule] ?? null,
      children,
      cycle: false,
    };
  };

  return walk(lineKey, 0, new Set());
}

/** Find a path of line keys from ancestor → descendant via calculation inputs. */
export function findCalculationPath(
  fromKey: string,
  toKey: string,
  version = "v3",
): string[] | null {
  const visit = (key: string, path: string[], seen: Set<string>): string[] | null => {
    if (key === toKey) return [...path, key];
    if (seen.has(key)) return null;
    const line = getLine(key, version);
    if (!line) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    for (const input of line.inputs ?? []) {
      const found = visit(input, [...path, key], nextSeen);
      if (found) return found;
    }
    return null;
  };
  return visit(fromKey, [], new Set());
}

export function listVersionLineKeys(version = "v3"): string[] {
  return getReturnVersion(version).lines.map((l) => l.key);
}
