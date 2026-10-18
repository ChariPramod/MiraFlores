import Decimal from "decimal.js";
import { getReturnVersion } from "@/lib/packet/indexes";

export type TaxEffectEstimate = {
  method: string;
  deltaTaxable: number;
  federalEffect: number | null;
  californiaEffect: number | null;
  limitations: string[];
  labeled: true;
  fullyRecomputed: false;
};

/**
 * Apply supplied version-specific rates to an independent adjustment root.
 * Does not recompute the return.
 */
export function estimateTaxEffect(options: {
  version: string;
  method:
    | "stcg"
    | "ltcg"
    | "interest"
    | "schc_profit"
    | "ordinary_income"
    | "itemized"
    | "none";
  /** Change in taxable amount (negative = lower income/gain). */
  deltaTaxable: number;
}): TaxEffectEstimate {
  const limitations: string[] = [
    "Labeled estimate from supplied tax_effect_rates only.",
    "Not a fully recomputed return.",
  ];

  if (options.method === "none") {
    return {
      method: options.method,
      deltaTaxable: options.deltaTaxable,
      federalEffect: 0,
      californiaEffect: 0,
      limitations,
      labeled: true,
      fullyRecomputed: false,
    };
  }

  const rates = getReturnVersion(options.version).tax_effect_rates as Record<
    string,
    { federal_per_dollar?: number; california_per_dollar?: number }
  >;
  const row = rates[options.method];
  if (!row) {
    return {
      method: options.method,
      deltaTaxable: options.deltaTaxable,
      federalEffect: null,
      californiaEffect: null,
      limitations: [...limitations, `No rate row for method ${options.method}.`],
      labeled: true,
      fullyRecomputed: false,
    };
  }

  const delta = new Decimal(options.deltaTaxable);
  const federal =
    row.federal_per_dollar === undefined
      ? null
      : delta.times(row.federal_per_dollar).toDecimalPlaces(2).toNumber();
  const california =
    row.california_per_dollar === undefined
      ? null
      : delta.times(row.california_per_dollar).toDecimalPlaces(2).toNumber();

  if (options.method === "stcg" || options.method === "ltcg") {
    limitations.push(
      "California effect uses the packet rate for this method; residency-day proration is not applied as an item-specific exact figure.",
    );
  }

  return {
    method: options.method,
    deltaTaxable: options.deltaTaxable,
    federalEffect: federal,
    californiaEffect: california,
    limitations,
    labeled: true,
    fullyRecomputed: false,
  };
}

/** Lot working gain from proceeds and supported basis (cents retained). */
export function lotWorkingGain(proceeds: number, basis: number): number {
  return new Decimal(proceeds).minus(basis).toDecimalPlaces(2).toNumber();
}
