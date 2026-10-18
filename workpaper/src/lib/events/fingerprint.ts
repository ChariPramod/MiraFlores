import { createHash } from "node:crypto";
import { getExtractedValue, getLine } from "@/lib/packet/indexes";
import { getPacket } from "@/lib/packet/load";
import { POLICY_VERSION, type WorkspaceProjection } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashMaterial(parts: unknown): string {
  return createHash("sha256")
    .update(stableStringify(parts))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Material fingerprint for a claim: engine value, working adjustment,
 * cited sources, calculation inputs, and policy — not views or unrelated notes.
 */
export function claimFingerprint(
  claimKey: string,
  version: string,
  projection: WorkspaceProjection,
): string {
  return materialFingerprint(claimKey, version, projection, true);
}

/** A verification signs the evidence and values it checked, not its own conclusion. */
export function verificationFingerprint(
  claimKey: string,
  version: string,
  projection: WorkspaceProjection,
): string {
  return materialFingerprint(claimKey, version, projection, false);
}

function materialFingerprint(
  claimKey: string,
  version: string,
  projection: WorkspaceProjection,
  includeVerification: boolean,
): string {
  const line = getLine(claimKey, version);
  const adj = projection.adjustments[`${version}::${claimKey}`];
  const verification = projection.verifications[`${version}::${claimKey}`];

  const evidenceDocuments = new Set<string>();
  const visited = new Set<string>();
  const dependencies: unknown[] = [];
  function collect(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const dependency = getLine(key, version);
    const working = projection.adjustments[scopeKey(version, key)];
    dependencies.push({ key, value: dependency?.value, working: working && !working.reversed ? { field: working.field, value: working.effectiveValue, evidence: working.evidenceRefs } : null });
    for (const ref of [...(dependency?.sources ?? []), ...(working && !working.reversed ? working.evidenceRefs : [])]) {
      const doc = ref.startsWith("ev-") ? getExtractedValue(ref)?.document_id : /^(?:doc:)?(D\d+)/.exec(ref)?.[1];
      if (doc) evidenceDocuments.add(doc);
    }
    for (const input of dependency?.inputs ?? []) collect(input);
  }
  collect(claimKey);
  return hashMaterial({
    dependencies,
    dispositions: [...evidenceDocuments].sort().map(id => {
      const d = projection.dispositions[id];
      return { id, disposition: d && !d.reversed ? d.disposition : null, explanation: d && !d.reversed ? d.explanation : null };
    }),
    claimKey,
    version,
    policyVersion: POLICY_VERSION,
    engineValue: line?.value ?? null,
    rule: line?.rule ?? null,
    inputs: line?.inputs ?? [],
    sources: line?.sources ?? [],
    adjustment: adj && !adj.reversed
      ? {
          field: adj.field,
          effectiveValue: adj.effectiveValue,
          workingGain: adj.workingGain ?? null,
          evidenceRefs: adj.evidenceRefs,
        }
      : null,
    ...(includeVerification ? { verificationOpen: verification?.open ? verification.conclusion : null } : {}),
  });
}

/** Conservative dependency set for sign-off invalidation. */
export function materialDependents(
  claimKey: string,
  version: string,
): string[] {
  const packet = getPacket();
  const versionRec = packet.return_versions.find((v) => v.version === version);
  if (!versionRec) return [claimKey];

  const consumers = new Map<string, string[]>();
  for (const line of versionRec.lines) {
    for (const input of line.inputs ?? []) {
      const list = consumers.get(input) ?? [];
      list.push(line.key);
      consumers.set(input, list);
    }
  }

  const out = new Set<string>([claimKey]);
  const queue = [claimKey];
  while (queue.length) {
    const key = queue.shift()!;
    for (const parent of consumers.get(key) ?? []) {
      if (!out.has(parent)) {
        out.add(parent);
        queue.push(parent);
      }
    }
  }
  return [...out];
}

export function scopeKey(version: string, claimKey: string): string {
  return `${version}::${claimKey}`;
}
