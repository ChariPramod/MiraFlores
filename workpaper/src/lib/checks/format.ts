import { formatMoney, formatNumber } from "@/lib/format/money";
import type { FindingValueKind } from "./types";

export function displayValue(
  kind: FindingValueKind,
  value: unknown,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return formatMoney(value);
  if (kind === "ein") return String(value);
  if (kind === "count" || kind === "quantity") return formatNumber(value);
  return String(value);
}

export function moneyOrBlank(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  if (value === 0 || value === 0.0) return formatMoney(0);
  return formatMoney(value);
}
