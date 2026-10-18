import 'server-only';
import { getPacket } from '@/lib/packet/load';
import { persona } from './policy';

const sensitiveKey = /(^|_)(ssn|pin|ip_pin|ippin|taxpayer_pin|spouse_pin|routing|account|account_number|bank_number|ero_pin|efin|ptin)(_|$)/i;
let tokens: string[] | undefined;
function sensitiveTokens(): string[] {
  if (tokens) return tokens;
  const found = new Set<string>();
  function add(v: unknown) {
    if (typeof v !== 'string' && typeof v !== 'number') return;
    const s = String(v);
    if (s.length < 4) return;
    found.add(s);
    if (/^[\d -]+$/.test(s)) found.add(s.replace(/\D/g, ''));
  }
  function walk(v: unknown) {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') for (const [key, value] of Object.entries(v)) {
      if (sensitiveKey.test(key)) add(value);
      walk(value);
    }
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) add(m[0]);
      for (const m of v.matchAll(/(?:account(?:\s*(?:number|no\.?|#))?|routing(?:\s*number)?|(?:(?:IP|taxpayer|spouse|ERO|authorization)\s*)?PIN)\s*[:#]?\s*([\dXx* -]{4,24})/gi)) add(m[1].trim());
    }
  }
  const packet = getPacket();
  walk(packet);
  for (const ev of packet.extracted_values) if (sensitiveKey.test(ev.field) || /ssn|account|routing|\bpin\b|ip.?pin/i.test(ev.value_type + ' ' + ev.label)) { add(ev.value); add(ev.text_as_read); }
  tokens = [...found].filter(Boolean).sort((a,b) => b.length-a.length);
  return tokens;
}
export function maskText(text: string): string {
  let out = text.replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, '[restricted]');
  for (const token of sensitiveTokens()) out = out.split(token).join('[restricted]');
  return out.replace(/((?:account(?:\s*(?:number|no\.?|#))?|routing(?:\s*number)?|(?:(?:IP|taxpayer|spouse|ERO|authorization)\s*)?PIN)\s*[:#]?\s*)[\dXx* -]{4,24}/gi, '$1[restricted]');
}
/** Apply at every server-to-browser DTO boundary, including nested event text. */
export function redact<T>(value: T, actorId: string): T {
  if (persona(actorId)?.cleared) return value;
  function walk(v: unknown, key = ''): unknown {
    if (v === null || v === undefined) return v;
    if (sensitiveKey.test(key) && (typeof v === 'string' || typeof v === 'number')) return '[restricted]';
    if (typeof v === 'string') return maskText(v);
    if (typeof v === 'number' && sensitiveTokens().includes(String(v))) return '[restricted]';
    if (Array.isArray(v)) return v.map(item => walk(item));
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,item]) => [k,walk(item,k)]));
    return v;
  }
  return walk(value) as T;
}
export function containsSensitive(value: unknown): boolean {
  const json = JSON.stringify(value);
  return maskText(json) !== json;
}
