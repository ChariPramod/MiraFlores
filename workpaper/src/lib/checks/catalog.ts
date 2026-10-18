/**
 * Maps evidence-derived finding fingerprints → PLAN.md catalog IDs.
 * The check logic never branches on these labels; this is display/register only.
 */
const FINGERPRINTS: Record<string, string> = {
  "printed-field-agreement:ev-1045": "E01",
  "supplemental-basis:F8949.B.N1": "E02",
  "supplemental-basis:F8949.B.N3": "E02",
  "supplemental-basis:F8949.E.N4": "E02",
  "duplicate-interest:SchB.1.1+SchB.1.2": "E03",
  "page-completeness:doc:D31#page32:M18": "E10",
};

export function catalogIdFor(fingerprint: string): string | null {
  return FINGERPRINTS[fingerprint] ?? null;
}

export const KNOWN_DAY2_CATALOG = ["E01", "E02", "E03", "E10"] as const;
