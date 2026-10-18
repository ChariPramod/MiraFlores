import "server-only";

import { getPacket } from "./load";
import { getIndexes } from "./indexes";
import type { DocumentRecord, ExtractedValue } from "./types";

/** Default simulation context from PLAN.md — v3 as of June 23, 2026. */
export const DEFAULT_AS_OF = "2026-06-23T23:59:59.999Z";

export type AvailabilityContext = {
  asOf: string;
};

export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function isAvailableAt(
  instant: string | null | undefined,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  const t = parseInstant(instant);
  if (t === null) {
    // Unknown timestamp: treat as unavailable rather than silently including
    return false;
  }
  const cutoff = parseInstant(asOf);
  if (cutoff === null) return false;
  return t <= cutoff;
}

export function documentAvailableAt(
  doc: DocumentRecord,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  return isAvailableAt(doc.received_at, asOf);
}

export function extractedAvailableAt(
  ev: ExtractedValue,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  const doc = getIndexes().documentsById.get(ev.document_id);
  if (!doc) return false;
  return documentAvailableAt(doc, asOf);
}

export function messageAvailableAt(
  messageId: string,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  const msg = getIndexes().messagesById.get(messageId);
  if (!msg) return false;
  const sent = String(msg.sent_at ?? msg.at ?? "");
  return isAvailableAt(sent, asOf);
}

export function callNoteAvailableAt(
  callId: string,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  const note = getIndexes().callNotesById.get(callId);
  if (!note) return false;
  const at = String(note.at ?? note.recorded_at ?? note.sent_at ?? "");
  return isAvailableAt(at, asOf);
}

export function questionnaireAvailableAt(
  _qaId: string,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  // Questionnaire was submitted Jan 20, 2026 (tl-02) — available for default as-of.
  const packet = getPacket();
  const submitted = packet.timeline.find(
    (t) => t.event === "questionnaire_submitted",
  );
  const at = String(submitted?.at ?? "2026-01-20T04:00:00Z");
  return isAvailableAt(at, asOf);
}

/** Check observation dates on a selected agency record and its ancestors.
 * Container references must not pull later siblings into an earlier package.
 */
function agencyAvailableAt(pointer: string, asOf: string): boolean {
  function observed(value: unknown, inherited: boolean): { allowed:boolean; dated:boolean } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {allowed:true,dated:inherited};
    const row=value as Record<string,unknown>;
    const dates=['as_of','date','dated','at','received_at'].flatMap(k => typeof row[k]==='string' ? [row[k] as string] : []);
    if (dates.some(d=>!isAvailableAt(d,asOf))) return {allowed:false,dated:false};
    if (typeof row.document==='string' && /^D\d+$/.test(row.document)) {
      const doc=getIndexes().documentsById.get(row.document);
      if (!doc || !documentAvailableAt(doc,asOf)) return {allowed:false,dated:false};
    }
    return {allowed:true,dated:inherited || dates.length>0};
  }
  let value:unknown=getPacket().tax_agency_records;
  let dated=false;
  for (const part of pointer.slice(1).split('/')) {
    const own=observed(value,dated);
    if (!own.allowed || !value || typeof value!=='object') return false;
    dated=own.dated;
    const key=part.replaceAll('~1','/').replaceAll('~0','~');
    if (!Object.prototype.hasOwnProperty.call(value,key)) return false;
    value=(value as Record<string,unknown>)[key];
  }
  function visible(item:unknown,parentDated:boolean):boolean {
    const own=observed(item,parentDated);
    if (!own.allowed) return false;
    if (Array.isArray(item)) return item.length>0 && item.every(child=>visible(child,own.dated));
    if (item && typeof item==='object') return Object.values(item).every(child=>visible(child,own.dated));
    return own.dated;
  }
  return visible(value,dated);
}

/**
 * Whether a packet reference is visible in the current simulation clock.
 * Future evidence (msg-07+, D71, D72, …) is excluded at the default as-of.
 */
export function refAvailableAt(
  ref: string,
  asOf: string = DEFAULT_AS_OF,
): boolean {
  const trimmed = ref.trim();
  if (/^ev-\d+$/.test(trimmed)) {
    const ev = getIndexes().extractedById.get(trimmed);
    if (!ev) return false;
    return extractedAvailableAt(ev, asOf);
  }
  if (/^D\d{2}$/.test(trimmed)) {
    const doc = getIndexes().documentsById.get(trimmed);
    if (!doc) return false;
    return documentAvailableAt(doc, asOf);
  }
  const docPage = /^doc:(D\d{2})#page\d+$/.exec(trimmed);
  if (docPage) {
    const doc = getIndexes().documentsById.get(docPage[1]);
    if (!doc) return false;
    return documentAvailableAt(doc, asOf);
  }
  if (/^msg-\d+$/.test(trimmed)) {
    return messageAvailableAt(trimmed, asOf);
  }
  if (/^call-\d+$/.test(trimmed)) {
    return callNoteAvailableAt(trimmed, asOf);
  }
  if (/^qa-\d+$/.test(trimmed)) {
    return questionnaireAvailableAt(trimmed, asOf);
  }
  if (trimmed.startsWith('timeline:')) {
    const item=getIndexes().timelineById.get(trimmed.slice('timeline:'.length));
    return !!item && isAvailableAt(String(item.at ?? ''),asOf);
  }
  if (trimmed.startsWith('agency:')) return trimmed.startsWith('agency:/') && agencyAvailableAt(trimmed.slice('agency:'.length),asOf);
  // Structural / prior / line refs are not gated by document receipt
  return true;
}

export function listUnavailableDocuments(asOf: string = DEFAULT_AS_OF): string[] {
  return getPacket()
    .documents.filter((d) => !documentAvailableAt(d, asOf))
    .map((d) => d.id);
}

export function listUnavailableMessages(asOf: string = DEFAULT_AS_OF): string[] {
  return getPacket()
    .client.messages.filter((m) => !messageAvailableAt(m.id, asOf))
    .map((m) => m.id);
}

export function earliestEvidenceInstant(refs: string[]): string | null {
  let min: number | null = null;
  let minIso: string | null = null;
  for (const ref of refs) {
    let iso: string | null = null;
    if (/^ev-\d+$/.test(ref)) {
      const ev = getIndexes().extractedById.get(ref);
      const doc = ev
        ? getIndexes().documentsById.get(ev.document_id)
        : undefined;
      iso = doc?.received_at ?? null;
    } else if (/^D\d{2}$/.test(ref)) {
      iso = getIndexes().documentsById.get(ref)?.received_at ?? null;
    } else if (/^msg-\d+$/.test(ref)) {
      const msg = getIndexes().messagesById.get(ref);
      iso = msg ? String(msg.sent_at ?? "") : null;
    } else if (/^call-\d+$/.test(ref)) {
      const note = getIndexes().callNotesById.get(ref);
      iso = note ? String(note.at ?? "") : null;
    }
    const t = parseInstant(iso);
    if (t !== null && (min === null || t < min)) {
      min = t;
      minIso = iso;
    }
  }
  return minIso;
}
