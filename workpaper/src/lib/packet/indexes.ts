import "server-only";

import { getPacket } from "./load";
import type {
  DocumentRecord,
  ExtractedValue,
  ReturnLine,
  ReturnVersion,
  TaxPacket,
} from "./types";

export type PacketIndexes = {
  documentsById: Map<string, DocumentRecord>;
  extractedById: Map<string, ExtractedValue>;
  extractedByDocument: Map<string, ExtractedValue[]>;
  versionsById: Map<string, ReturnVersion>;
  linesByVersionKey: Map<string, ReturnLine>;
  /** lineKey -> lines that list it as an input (same version). */
  usedAsInputBy: Map<string, string[]>;
  /** sourceRef -> line keys that cite it (same version). */
  usedAsSourceBy: Map<string, string[]>;
  questionnaireById: Map<string, Record<string, unknown>>;
  messagesById: Map<string, Record<string, unknown>>;
  callNotesById: Map<string, Record<string, unknown>>;
  timelineById: Map<string, Record<string, unknown>>;
  householdById: Map<string, Record<string, unknown>>;
  assetsByVersionId: Map<string, Record<string, unknown>>;
};

function versionLineKey(version: string, lineKey: string): string {
  return `${version}::${lineKey}`;
}

function buildIndexes(packet: TaxPacket): PacketIndexes {
  const documentsById = new Map(
    packet.documents.map((doc) => [doc.id, doc] as const),
  );
  const extractedById = new Map(
    packet.extracted_values.map((ev) => [ev.id, ev] as const),
  );
  const extractedByDocument = new Map<string, ExtractedValue[]>();
  for (const ev of packet.extracted_values) {
    const list = extractedByDocument.get(ev.document_id) ?? [];
    list.push(ev);
    extractedByDocument.set(ev.document_id, list);
  }

  const versionsById = new Map(
    packet.return_versions.map((v) => [v.version, v] as const),
  );
  const linesByVersionKey = new Map<string, ReturnLine>();
  const usedAsInputBy = new Map<string, string[]>();
  const usedAsSourceBy = new Map<string, string[]>();
  const assetsByVersionId = new Map<string, Record<string, unknown>>();

  for (const version of packet.return_versions) {
    for (const asset of version.assets) {
      assetsByVersionId.set(
        `${version.version}::${asset.asset_id}`,
        asset as Record<string, unknown>,
      );
    }
    for (const line of version.lines) {
      linesByVersionKey.set(versionLineKey(version.version, line.key), line);
      for (const input of line.inputs ?? []) {
        const key = versionLineKey(version.version, input);
        const list = usedAsInputBy.get(key) ?? [];
        list.push(line.key);
        usedAsInputBy.set(key, list);
      }
      for (const source of line.sources ?? []) {
        const list = usedAsSourceBy.get(source) ?? [];
        list.push(`${version.version}:${line.key}`);
        usedAsSourceBy.set(source, list);
      }
    }
  }

  const questionnaireById = new Map(
    packet.client.questionnaire.map(
      (q) => [q.id, q as Record<string, unknown>] as const,
    ),
  );
  const messagesById = new Map(
    packet.client.messages.map(
      (m) => [m.id, m as Record<string, unknown>] as const,
    ),
  );
  const callNotesById = new Map(
    packet.client.call_notes.map(
      (c) => [c.id, c as Record<string, unknown>] as const,
    ),
  );
  const timelineById = new Map(
    packet.timeline.map((t) => [t.id, t as Record<string, unknown>] as const),
  );
  const householdById = new Map(
    packet.household.people.map(
      (p) => [p.id, p as Record<string, unknown>] as const,
    ),
  );

  return {
    documentsById,
    extractedById,
    extractedByDocument,
    versionsById,
    linesByVersionKey,
    usedAsInputBy,
    usedAsSourceBy,
    questionnaireById,
    messagesById,
    callNotesById,
    timelineById,
    householdById,
    assetsByVersionId,
  };
}

let indexesCache: PacketIndexes | null = null;

export function getIndexes(): PacketIndexes {
  if (!indexesCache) {
    indexesCache = buildIndexes(getPacket());
  }
  return indexesCache;
}

export function getReturnVersion(version = "v3"): ReturnVersion {
  const v = getIndexes().versionsById.get(version);
  if (!v) {
    throw new Error(`Unknown return version: ${version}`);
  }
  return v;
}

export function getLine(
  lineKey: string,
  version = "v3",
): ReturnLine | undefined {
  return getIndexes().linesByVersionKey.get(versionLineKey(version, lineKey));
}

export function getConsumersOfLine(
  lineKey: string,
  version = "v3",
): string[] {
  return (
    getIndexes().usedAsInputBy.get(versionLineKey(version, lineKey)) ?? []
  );
}

export function getLinesUsingSource(sourceRef: string): string[] {
  return getIndexes().usedAsSourceBy.get(sourceRef) ?? [];
}

export function getDocument(documentId: string): DocumentRecord | undefined {
  return getIndexes().documentsById.get(documentId);
}

export function getExtractedValue(
  id: string,
): ExtractedValue | undefined {
  return getIndexes().extractedById.get(id);
}

export function getExtractedForDocument(
  documentId: string,
): ExtractedValue[] {
  return getIndexes().extractedByDocument.get(documentId) ?? [];
}

/** Reverse index: lines (any version) that cite any extraction from this document. */
export function getLinesUsingDocument(documentId: string): string[] {
  const values = getExtractedForDocument(documentId);
  const out = new Set<string>();
  for (const ev of values) {
    for (const lineRef of getLinesUsingSource(ev.id)) {
      out.add(lineRef);
    }
  }
  return [...out].sort();
}
