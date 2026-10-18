import "server-only";

import {
  agreementFromResolution,
  locatePrintedText,
  segmentPrintedContent,
  type LocatedAnchor,
  type TextSegment,
} from "@/lib/documents/anchors";
import {
  DEFAULT_AS_OF,
  documentAvailableAt,
  extractedAvailableAt,
} from "@/lib/packet/availability";
import {
  getDocument,
  getExtractedForDocument,
  getExtractedValue,
  getLinesUsingDocument,
  getLinesUsingSource,
} from "@/lib/packet/indexes";
import type { EvidenceLocator, ExtractedValue } from "@/lib/packet/types";

export type RenderedPage = {
  documentId: string;
  title: string;
  documentType: string;
  issuer: string;
  owner: string;
  taxYear: number;
  fileName: string;
  page: number;
  pageCount: number;
  extractionStatus: string;
  simulatedLabel: string;
  printedContent: string;
  segments: TextSegment[];
  locator: LocatedAnchor | EvidenceLocator | null;
  fieldLocated: boolean;
  anchorResolution: string | null;
  available: boolean;
  asOf: string;
  unavailableReason: string | null;
  extractedOnPage: Array<{
    id: string;
    field: string;
    label: string;
    value: unknown;
    textAsRead: string;
    confidence: number;
  }>;
  usedByLines: string[];
};

export interface DocumentRenderer {
  renderPage(
    documentId: string,
    page: number,
    highlight?: EvidenceLocator | string,
  ): RenderedPage | null;
  highlight(locator: EvidenceLocator): RenderedPage | null;
}

function normalizeHighlight(
  documentId: string,
  page: number,
  highlight?: EvidenceLocator | string,
  asOf: string = DEFAULT_AS_OF,
): LocatedAnchor | EvidenceLocator | null {
  if (!highlight) return null;
  if (typeof highlight === "string") {
    const ev = getExtractedValue(highlight);
    if (!ev) {
      return { documentId, page, extractedValueId: highlight };
    }
    if (!extractedAvailableAt(ev, asOf)) {
      return {
        documentId,
        page,
        extractedValueId: highlight,
        fieldKey: ev.field,
        resolution: "unresolved",
      };
    }
    if (ev.document_id !== documentId || ev.page !== page) {
      return {
        documentId,
        page,
        extractedValueId: highlight,
        fieldKey: ev.field,
        rectangle: ev.position,
      };
    }
    const doc = getDocument(documentId);
    const printed = doc?.pages.find((p) => p.page === page);
    if (!printed) {
      return {
        documentId,
        page,
        extractedValueId: highlight,
        fieldKey: ev.field,
        rectangle: ev.position,
        resolution: "unresolved",
      };
    }
    return locatePrintedText(printed, ev);
  }
  return highlight;
}

export function renderDocumentPage(
  documentId: string,
  page: number,
  highlight?: EvidenceLocator | string,
  asOf: string = DEFAULT_AS_OF,
): RenderedPage | null {
  const doc = getDocument(documentId);
  if (!doc) return null;
  const available = documentAvailableAt(doc, asOf);
  const printed = doc.pages.find((p) => p.page === page);
  if (!printed) return null;

  if (!available) {
    return {
      documentId: doc.id,
      title: doc.title,
      documentType: doc.document_type,
      issuer: doc.issuer,
      owner: doc.belongs_to,
      taxYear: doc.tax_year,
      fileName: doc.file_name,
      page: printed.page,
      pageCount: doc.page_count,
      extractionStatus: doc.extraction.status,
      simulatedLabel: "Simulated source document — not available at simulation clock",
      printedContent: "",
      segments: [],
      locator: null,
      fieldLocated: false,
      anchorResolution: null,
      available: false,
      asOf,
      unavailableReason: `Document received ${doc.received_at}; simulation as-of is ${asOf.slice(0, 10)}. Open Replay to inspect evidence at a later milestone.`,
      extractedOnPage: [],
      usedByLines: [],
    };
  }

  const locator = normalizeHighlight(documentId, page, highlight, asOf);
  const fieldLocated = Boolean(locator && "textAnchor" in locator && locator.textAnchor);
  const anchorResolution =
    locator && "resolution" in locator && locator.resolution
      ? String(locator.resolution)
      : fieldLocated
        ? "resolved_match"
        : locator
          ? "unresolved"
          : null;
  const segments = segmentPrintedContent(printed.printed_content, locator);

  const extractedOnPage = getExtractedForDocument(documentId)
    .filter((ev) => ev.page === page && extractedAvailableAt(ev, asOf))
    .map((ev) => ({
      id: ev.id,
      field: ev.field,
      label: ev.label,
      value: ev.value,
      textAsRead: ev.text_as_read,
      confidence: ev.confidence,
    }));

  const usedByLines =
    locator && "extractedValueId" in locator && locator.extractedValueId
      ? getLinesUsingSource(locator.extractedValueId)
      : getLinesUsingDocument(documentId);

  return {
    documentId: doc.id,
    title: doc.title,
    documentType: doc.document_type,
    issuer: doc.issuer,
    owner: doc.belongs_to,
    taxYear: doc.tax_year,
    fileName: doc.file_name,
    page: printed.page,
    pageCount: doc.page_count,
    extractionStatus: doc.extraction.status,
    simulatedLabel: "Simulated source document — printed content from packet",
    printedContent: printed.printed_content,
    segments,
    locator,
    fieldLocated,
    anchorResolution,
    available: true,
    asOf,
    unavailableReason: null,
    extractedOnPage,
    usedByLines,
  };
}

export function highlightLocator(locator: EvidenceLocator): RenderedPage | null {
  return renderDocumentPage(locator.documentId, locator.page, locator);
}

export function locatorForExtractedValue(
  extractedValueId: string,
  asOf: string = DEFAULT_AS_OF,
): LocatedAnchor | null {
  const ev = getExtractedValue(extractedValueId);
  if (!ev) return null;
  if (!extractedAvailableAt(ev, asOf)) return null;
  const doc = getDocument(ev.document_id);
  const printed = doc?.pages.find((p) => p.page === ev.page);
  if (!printed) {
    return {
      documentId: ev.document_id,
      page: ev.page,
      fieldKey: ev.field,
      extractedValueId: ev.id,
      rectangle: ev.position,
      resolution: "unresolved",
      highlightedText: null,
      printedComparable: null,
      extractedComparable: String(ev.value ?? ev.text_as_read ?? ""),
    };
  }
  return locatePrintedText(printed, ev);
}

export const documentRenderer: DocumentRenderer = {
  renderPage: renderDocumentPage,
  highlight: highlightLocator,
};

export function sideBySideValues(
  extracted: ExtractedValue,
  asOf: string = DEFAULT_AS_OF,
): {
  printedSnippet: string | null;
  extractedValue: unknown;
  textAsRead: string;
  confidence: number;
  agreement: "match" | "mismatch" | "blank_extraction" | "unresolved";
  resolution: string;
} {
  const locator = locatorForExtractedValue(extracted.id, asOf);
  if (!locator) {
    return {
      printedSnippet: null,
      extractedValue: extracted.value,
      textAsRead: extracted.text_as_read,
      confidence: extracted.confidence,
      agreement: "unresolved",
      resolution: "unavailable",
    };
  }
  const agreement = agreementFromResolution(locator.resolution);
  return {
    printedSnippet: locator.highlightedText,
    extractedValue: extracted.value,
    textAsRead: extracted.text_as_read,
    confidence: extracted.confidence,
    agreement,
    resolution: locator.resolution,
  };
}
