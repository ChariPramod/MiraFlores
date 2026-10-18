import "server-only";

import Decimal from "decimal.js";
import { formatMoney, formatNumber } from "@/lib/format/money";
import { getReturnVersion } from "./indexes";
import { getPacket } from "./load";

export type SaleLotRow = {
  key: string;
  label: string;
  valueDisplay: string;
  proceeds: string;
  basis: string;
  term: string;
  formBox: string;
  exception: string | null;
  href: string;
};

export function projectSalesLots(
  version = "v3",
): {
  exceptions: SaleLotRow[];
  lots: SaleLotRow[];
  totalCount: number;
} {
  const ret = getReturnVersion(version);
  const lots = ret.lines
    .filter((l) => /^F8949\.[A-Z]+\.[A-Z]?\d+[A-Z0-9]*$/.test(l.key) || /^F8949\.[A-Z]+\.[A-Z]+\d+$/.test(l.key))
    .filter((l) => !l.key.endsWith(".total"))
    .map((l) => {
      const proceedsM = /proceeds\s+([\d,]+\.?\d*)/i.exec(l.label);
      const basisM = /basis\s+([\d,]+\.?\d*)/i.exec(l.label);
      const basisBlank = /basis\s+0(?:\.0+)?/i.test(l.label) || /basis \(not reported\)/i.test(l.label);
      const term = /short-term/i.test(l.label)
        ? "short"
        : /long-term/i.test(l.label)
          ? "long"
          : "—";
      const box = l.key.split(".")[1] ?? "";
      let exception: string | null = null;
      if (basisBlank && /RSU/i.test(l.label)) {
        exception = "Zero/blank basis on RSU lot";
      }
      if (/M18/i.test(l.label)) {
        exception = "Review lot";
      }
      return {
        key: l.key,
        label: l.label,
        valueDisplay: formatMoney(l.value),
        proceeds: proceedsM ? formatMoney(proceedsM[1].replace(/,/g, "")) : "—",
        basis: basisM ? formatMoney(basisM[1].replace(/,/g, "")) : basisBlank ? "(blank/0)" : "—",
        term,
        formBox: box,
        exception,
        href: `/claim/${encodeURIComponent(l.key)}?version=${version}`,
      } satisfies SaleLotRow;
    });

  const exceptions = lots.filter((l) => l.exception);
  return { exceptions, lots, totalCount: lots.length };
}

export type AssetRow = {
  assetId: string;
  description: string;
  activity: string;
  costDisplay: string;
  method: string;
  lifeYears: string;
  federalAccumEnd: string;
  caAccumEnd: string;
  federalDepreciation2025: string;
  disposed: boolean;
};

export function projectAssets(version = "v3"): AssetRow[] {
  const ret = getReturnVersion(version);
  return ret.assets.map((a) => {
    const federal = a.federal as Record<string, number> | undefined;
    const california = a.california as Record<string, number> | undefined;
    return {
      assetId: a.asset_id,
      description: String(a.description ?? ""),
      activity: String(a.activity ?? ""),
      costDisplay: formatMoney(a.cost),
      method: String(a.method ?? "—"),
      lifeYears: formatNumber(a.life_years),
      federalAccumEnd: formatMoney(federal?.accumulated_end),
      caAccumEnd: formatMoney(california?.accumulated_end),
      federalDepreciation2025: formatMoney(federal?.depreciation_2025),
      disposed: Boolean(a.disposed_at ?? a.disposition),
    };
  });
}

export type PriorYearSwing = {
  key: string;
  label: string;
  prior: string;
  current: string;
  delta: string;
  pct: string;
  swing: boolean;
  note: string | null;
};

/**
 * Prior-year comparison with firm threshold: over 10% AND over $1,000.
 * Explicit handling when prior baseline is zero.
 */
export function projectPriorYearComparison(version = "v3"): {
  swings: PriorYearSwing[];
  rows: PriorYearSwing[];
} {
  const packet = getPacket();
  const prior = packet.prior_years.return_2024 as {
    lines: Record<string, unknown>;
    line_labels: Record<string, string>;
  };
  const current = getReturnVersion(version);
  const keys = Object.keys(prior.lines);
  const rows: PriorYearSwing[] = [];

  for (const key of keys) {
    const priorVal = prior.lines[key];
    const curLine = current.lines.find((l) => l.key === key);
    if (curLine === undefined) continue;
    if (typeof priorVal !== "number" || typeof curLine.value !== "number") {
      continue;
    }
    const p = new Decimal(priorVal);
    const c = new Decimal(curLine.value);
    const delta = c.minus(p);
    let pctDisplay: string;
    let swing = false;
    let note: string | null = null;

    if (p.isZero()) {
      pctDisplay = c.isZero() ? "0%" : "n/a (zero baseline)";
      note = c.isZero()
        ? null
        : "Prior baseline is zero — percentage swing not defined; absolute change shown.";
      swing = delta.abs().greaterThan(1000);
    } else {
      const pct = delta.div(p.abs()).times(100);
      pctDisplay = `${pct.toFixed(1)}%`;
      swing = pct.abs().greaterThan(10) && delta.abs().greaterThan(1000);
    }

    rows.push({
      key,
      label: prior.line_labels[key] ?? curLine.label,
      prior: formatMoney(priorVal),
      current: formatMoney(curLine.value),
      delta: formatMoney(delta.toNumber()),
      pct: pctDisplay,
      swing,
      note,
    });
  }

  const swings = rows.filter((r) => r.swing);
  return { swings, rows };
}
