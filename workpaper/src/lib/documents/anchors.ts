import type { EvidenceLocator, ExtractedValue, PrintedPage } from "@/lib/packet/types";

export type TextSegment = {
  text: string;
  highlighted: boolean;
  start: number;
  end: number;
};

export type AnchorResolution =
  | "resolved_match"
  | "resolved_mismatch"
  | "resolved_blank"
  | "unresolved";

export type LocatedAnchor = EvidenceLocator & {
  resolution: AnchorResolution;
  highlightedText: string | null;
  printedComparable: string | null;
  extractedComparable: string | null;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lot / field prefix before first underscore (N1, RSU-2502, X54, …). */
export function fieldLotPrefix(field: string): string | null {
  const m = /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)_/.exec(field);
  return m ? m[1] : null;
}

/**
 * Find the lot token as its own token so N1 does not match inside N10 / N18.
 */
export function findLotWindow(
  content: string,
  lot: string,
): { start: number; end: number; lotStart: number } | null {
  const re = new RegExp(
    `(?:^|[^A-Za-z0-9])(${escapeRegExp(lot)})(?=[^A-Za-z0-9]|$)`,
  );
  const m = re.exec(content);
  if (!m || m.index === undefined) return null;
  const lotStart = m.index + m[0].indexOf(m[1]);
  // Window runs until the next sibling lot token of similar shape, or +220 chars
  const after = content.slice(lotStart + lot.length);
  const nextLot =
    /(?:^|[^A-Za-z0-9])([A-Z]{1,5}-?\d+[A-Za-z0-9-]*)(?=[^A-Za-z0-9]|$)/.exec(
      after.slice(1),
    );
  let end = content.length;
  if (nextLot && nextLot.index !== undefined) {
    const candidate =
      lotStart + lot.length + 1 + nextLot.index + nextLot[0].indexOf(nextLot[1]);
    // Only treat as next lot if it looks like a brokerage/plan lot id
    if (/^[A-Z]+-?\d+/.test(nextLot[1]) && nextLot[1] !== lot) {
      end = candidate;
    }
  }
  end = Math.min(end, lotStart + 260);
  return { start: lotStart, end, lotStart };
}

function formatMoneyCandidate(value: number): string[] {
  return [
    value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    value.toFixed(2),
    String(value),
  ];
}

function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizeMoneyText(s: string): string {
  return s.replace(/[$,\s]/g, "");
}

function locateWithin(
  content: string,
  start: number,
  end: number,
  pattern: RegExp,
): { start: number; end: number; text: string } | null {
  const slice = content.slice(start, end);
  const m = pattern.exec(slice);
  if (!m || m.index === undefined) return null;
  const abs = start + m.index;
  return { start: abs, end: abs + m[0].length, text: m[0] };
}

function baseLocator(
  extracted: ExtractedValue,
  page: PrintedPage,
  anchor: { start: number; end: number } | null,
  resolution: AnchorResolution,
  content: string,
  printedComparable: string | null,
  extractedComparable: string | null,
): LocatedAnchor {
  const highlightedText =
    anchor != null ? content.slice(anchor.start, anchor.end) : null;
  return {
    documentId: extracted.document_id,
    page: page.page,
    fieldKey: extracted.field,
    extractedValueId: extracted.id,
    textAnchor: anchor ?? undefined,
    rectangle: extracted.position,
    resolution,
    highlightedText,
    printedComparable,
    extractedComparable,
  };
}

/**
 * Build a field- and lot-specific text anchor for a printed field.
 * Repeated values must resolve inside the correct lot/field window.
 * Synthetic packet positions are never treated as verified PDF coordinates.
 */
export function locatePrintedText(
  page: PrintedPage,
  extracted: ExtractedValue,
): LocatedAnchor {
  const content = page.printed_content;
  const field = extracted.field;
  const lot = fieldLotPrefix(field);
  const isBasis =
    /basis/i.test(field) || /basis/i.test(extracted.label);
  const extractedText = (extracted.text_as_read ?? "").trim();
  const extractedComparable =
    extractedText ||
    (extracted.value === null || extracted.value === undefined
      ? null
      : String(extracted.value));

  // --- Lot-scoped basis / proceeds / dates ---
  if (lot) {
    const window = findLotWindow(content, lot);
    if (window) {
      if (isBasis) {
        const blank = locateWithin(
          content,
          window.start,
          window.end,
          /basis\s*\(not reported\)/i,
        );
        if (blank) {
          const blankExtraction =
            extractedText === "" ||
            extracted.value === "" ||
            extracted.value === 0 ||
            extracted.value === 0.0;
          return baseLocator(
            extracted,
            page,
            blank,
            blankExtraction ? "resolved_blank" : "resolved_mismatch",
            content,
            blank.text,
            extractedComparable,
          );
        }
        const withAmount = locateWithin(
          content,
          window.start,
          window.end,
          /(?:adjusted\s+)?basis\s+[\d,]+\.\d{2}/i,
        );
        if (withAmount) {
          const amountMatch = /([\d,]+\.\d{2})/.exec(withAmount.text);
          const printedAmount = amountMatch ? amountMatch[1] : withAmount.text;
          let resolution: AnchorResolution = "resolved_match";
          if (extractedText === "" && (extracted.value === 0 || extracted.value === 0.0)) {
            resolution = "resolved_mismatch";
          } else if (typeof extracted.value === "number") {
            const same =
              normalizeMoneyText(printedAmount) ===
              normalizeMoneyText(
                extracted.value.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              );
            resolution = same ? "resolved_match" : "resolved_mismatch";
          } else if (extractedText) {
            resolution =
              normalizeMoneyText(printedAmount) ===
              normalizeMoneyText(extractedText)
                ? "resolved_match"
                : "resolved_mismatch";
          }
          return baseLocator(
            extracted,
            page,
            withAmount,
            resolution,
            content,
            withAmount.text,
            extractedComparable,
          );
        }
        // Lot found but basis phrase missing — unresolved, not a discrepancy
        return baseLocator(
          extracted,
          page,
          { start: window.lotStart, end: window.lotStart + lot.length },
          "unresolved",
          content,
          null,
          extractedComparable,
        );
      }

      // Non-basis lot fields: match value inside the lot window only
      const candidates: string[] = [];
      if (extractedText) candidates.push(extractedText);
      if (typeof extracted.value === "string" && extracted.value.trim()) {
        candidates.push(extracted.value.trim());
      }
      if (typeof extracted.value === "number") {
        candidates.push(...formatMoneyCandidate(extracted.value));
      }
      for (const candidate of candidates) {
        const idx = content.indexOf(candidate, window.start);
        if (idx >= window.start && idx < window.end) {
          const printed = content.slice(idx, idx + candidate.length);
          const match =
            normalizeMoneyText(printed) === normalizeMoneyText(candidate) ||
            printed === candidate;
          return baseLocator(
            extracted,
            page,
            { start: idx, end: idx + candidate.length },
            match ? "resolved_match" : "resolved_mismatch",
            content,
            printed,
            extractedComparable,
          );
        }
      }
    }
  }

  // --- EIN / tax ID: prefer label-local printed token; compare to extraction ---
  if (extracted.value_type === "ein" || /ein|tax.?id/i.test(field) || /tax id/i.test(extracted.label)) {
    const taxIdLabel = /tax\s*id/i.exec(content);
    if (taxIdLabel && taxIdLabel.index !== undefined) {
      const regionStart = taxIdLabel.index;
      const regionEnd = Math.min(content.length, regionStart + 48);
      const printedEin = locateWithin(
        content,
        regionStart,
        regionEnd,
        /\d{2}-\d{7}/,
      );
      if (printedEin) {
        const extractedDigits = normalizeDigits(String(extracted.value ?? extractedText));
        const printedDigits = normalizeDigits(printedEin.text);
        const resolution: AnchorResolution =
          extractedDigits && printedDigits && extractedDigits === printedDigits
            ? "resolved_match"
            : "resolved_mismatch";
        return baseLocator(
          extracted,
          page,
          printedEin,
          resolution,
          content,
          printedEin.text,
          extractedComparable,
        );
      }
    }
  }

  // --- Generic: search for extracted text, but require uniqueness or field hint ---
  const candidates: string[] = [];
  if (extractedText) candidates.push(extractedText);
  if (typeof extracted.value === "string" && extracted.value.trim()) {
    candidates.push(extracted.value.trim());
  }
  if (typeof extracted.value === "number") {
    candidates.push(...formatMoneyCandidate(extracted.value));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const matches: number[] = [];
    let from = 0;
    while (from < content.length) {
      const idx = content.indexOf(candidate, from);
      if (idx < 0) break;
      matches.push(idx);
      from = idx + 1;
    }
    if (matches.length === 1) {
      const idx = matches[0];
      return baseLocator(
        extracted,
        page,
        { start: idx, end: idx + candidate.length },
        "resolved_match",
        content,
        content.slice(idx, idx + candidate.length),
        extractedComparable,
      );
    }
    if (matches.length > 1) {
      // Ambiguous repeated value without lot scope — unresolved
      return baseLocator(
        extracted,
        page,
        null,
        "unresolved",
        content,
        null,
        extractedComparable,
      );
    }
  }

  // Blank extraction with no printable token
  if (
    extractedText === "" &&
    (extracted.value === "" ||
      extracted.value === 0 ||
      extracted.value === 0.0 ||
      extracted.value === null)
  ) {
    return baseLocator(
      extracted,
      page,
      null,
      "unresolved",
      content,
      null,
      extractedComparable,
    );
  }

  return baseLocator(
    extracted,
    page,
    null,
    "unresolved",
    content,
    null,
    extractedComparable,
  );
}

export function segmentPrintedContent(
  content: string,
  locator: EvidenceLocator | null,
): TextSegment[] {
  if (!locator?.textAnchor) {
    return [{ text: content, highlighted: false, start: 0, end: content.length }];
  }
  const { start, end } = locator.textAnchor;
  if (start < 0 || end > content.length || start >= end) {
    return [{ text: content, highlighted: false, start: 0, end: content.length }];
  }
  const segments: TextSegment[] = [];
  if (start > 0) {
    segments.push({
      text: content.slice(0, start),
      highlighted: false,
      start: 0,
      end: start,
    });
  }
  segments.push({
    text: content.slice(start, end),
    highlighted: true,
    start,
    end,
  });
  if (end < content.length) {
    segments.push({
      text: content.slice(end),
      highlighted: false,
      start: end,
      end: content.length,
    });
  }
  return segments;
}

export function agreementFromResolution(
  resolution: AnchorResolution,
): "match" | "mismatch" | "blank_extraction" | "unresolved" {
  switch (resolution) {
    case "resolved_match":
      return "match";
    case "resolved_mismatch":
      return "mismatch";
    case "resolved_blank":
      return "blank_extraction";
    case "unresolved":
      return "unresolved";
  }
}
