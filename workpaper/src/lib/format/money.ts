import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function asDecimal(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Decimal) return value;
  try {
    return new Decimal(value as Decimal.Value);
  } catch {
    return null;
  }
}

/** Format money without converting unknown/blank to zero. */
export function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const d = asDecimal(value);
  if (!d) return String(value);
  const negative = d.isNegative();
  const abs = d.abs().toFixed(2);
  const [whole, frac] = abs.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "(" : ""}${grouped}.${frac}${negative ? ")" : ""}`;
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const d = asDecimal(value);
  if (d && d.isInteger()) return d.toFixed(0);
  if (d) return d.toFixed(2);
  return String(value);
}

export function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}
