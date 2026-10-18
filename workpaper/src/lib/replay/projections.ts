import 'server-only';

import { getPacket } from '@/lib/packet/load';
import { documentAvailableAt, isAvailableAt, messageAvailableAt, callNoteAvailableAt } from '@/lib/packet/availability';
import { renderDocumentPage } from '@/lib/documents/renderer';
import { activePersonas } from '@/lib/security/policy';
import type { AdjustmentRecord } from '@/lib/events/types';
import type { ReturnLine } from '@/lib/packet/types';

export const DEFAULT_REPLAY_STAGE = 'tl-17';

function timeline() {
  return getPacket().timeline.map(t => ({
    id: t.id, at: String(t.at), event: String(t.event), actor: typeof t.actor === 'string' ? t.actor : null,
    // Authorization PINs are not needed to understand a timeline milestone.
    detail: typeof t.detail === 'string' ? t.detail.replace(/Taxpayer PIN \d+; spouse PIN \d+\.\s*/g, '') : null,
    refs: Array.isArray(t.refs) ? t.refs.filter((r): r is string => typeof r === 'string') : [],
  }));
}

/** Only packet milestone IDs are accepted. The current workspace clock is never changed. */
export function replayCursor(stageId = DEFAULT_REPLAY_STAGE) {
  const stages = timeline();
  const stage = stages.find(t => t.id === stageId);
  if (!stage) return null;
  const version = getPacket().return_versions.filter(v => isAvailableAt(v.computed_at, stage.at)).at(-1)?.version ?? null;
  return { stage, stages, asOf: stage.at, version };
}

export function projectReplay(stageId = DEFAULT_REPLAY_STAGE) {
  const cursor = replayCursor(stageId);
  if (!cursor) return null;
  const packet = getPacket();
  const { asOf, stage, stages } = cursor;
  const versions = packet.return_versions.filter(v => isAvailableAt(v.computed_at, asOf));
  const version = versions.at(-1);
  const documents = packet.documents.filter(d => documentAvailableAt(d, asOf));
  const extension = packet.what_if.extension as { computed_at: string; based_on_version: string; federal: Record<string, number | string>; california: Record<string, number | string> };
  return {
    stage, asOf, version: version?.version ?? null,
    stages: stages.map(({ id, at, event }) => ({ id, at, label: event.replaceAll('_', ' ') })),
    history: stages.filter(t => isAvailableAt(t.at, asOf)),
    actors: activePersonas(asOf),
    summary: version?.summary ?? null,
    documents: documents.map(d => ({ id: d.id, title: d.title, receivedAt: d.received_at, pages: d.page_count, superseded: version?.documents_superseded.includes(d.id) ?? false })),
    messages: packet.client.messages.filter(m => messageAvailableAt(m.id, asOf)).map(m => ({ id: m.id, at: String(m.sent_at), from: String(m.from), text: String(m.text) })),
    calls: packet.client.call_notes.filter(c => callNoteAvailableAt(c.id, asOf)).map(c => ({ id: c.id, at: String(c.at), title: String(c.title ?? 'Client call') })),
    versionChange: versions.length > 1 ? compareVersions(versions.at(-2)!.version, version!.version) : null,
    extension: isAvailableAt(extension.computed_at, asOf) ? extension : null,
  };
}

/** Evidence previews stay inside replay: future references return no metadata or text. */
export function projectReplayEvidence(stageId: string, ref: string, page = 1) {
  const cursor = replayCursor(stageId);
  if (!cursor || !Number.isInteger(page) || page < 1) return null;
  const packet = getPacket();
  if (/^D\d{2}$/.test(ref)) {
    const document = packet.documents.find(d => d.id === ref);
    if (!document || !documentAvailableAt(document, cursor.asOf)) return null;
    const rendered = renderDocumentPage(ref, page, undefined, cursor.asOf);
    if (!rendered?.available) return null;
    // Do not expose reverse usages from engine versions that did not exist yet.
    return { kind: 'document' as const, ref, title: rendered.title, page: rendered.page, pages: rendered.pageCount, text: rendered.printedContent, asOf: cursor.asOf };
  }
  if (/^msg-\d+$/.test(ref) && messageAvailableAt(ref, cursor.asOf)) {
    const message = packet.client.messages.find(m => m.id === ref)!;
    return { kind: 'message' as const, ref, title: `Message from ${String(message.from)}`, text: String(message.text), page: 1, pages: 1, asOf: cursor.asOf };
  }
  if (/^call-\d+$/.test(ref) && callNoteAvailableAt(ref, cursor.asOf)) {
    const call = packet.client.call_notes.find(c => c.id === ref)!;
    return { kind: 'call' as const, ref, title: String(call.title ?? 'Client call'), text: JSON.stringify(call, null, 2), page: 1, pages: 1, asOf: cursor.asOf };
  }
  // Agency records contain future nested entries. They are intentionally not expanded here.
  return null;
}

function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
export function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Derive changes from actual line values rather than trusting changes_from_previous. */
export function compareVersions(fromId: string, toId: string, adjustments: AdjustmentRecord[] = []) {
  const versions = getPacket().return_versions;
  const from = versions.find(v => v.version === fromId);
  const to = versions.find(v => v.version === toId);
  if (!from || !to) return null;
  const before = new Map(from.lines.map(l => [l.key, l]));
  const after = new Map(to.lines.map(l => [l.key, l]));
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const rows = keys.flatMap(key => {
    const a = before.get(key), b = after.get(key);
    if (a && b && same(a.value, b.value)) return [];
    return [{ key, label: b?.label ?? a!.label, kind: !a ? 'added' : !b ? 'removed' : 'changed', old: a?.value ?? null, new: b?.value ?? null, beforePresent: Boolean(a), afterPresent: Boolean(b), delta: typeof a?.value === 'number' && typeof b?.value === 'number' ? b.value - a.value : null }];
  });
  const changedOrRewired = (a?: ReturnLine, b?: ReturnLine) => !a || !b || !same(a.value, b.value) || !same(a.inputs, b.inputs) || !same(a.sources, b.sources);
  const overlaps = adjustments.filter(a => !a.reversed && a.engineVersion === fromId).map(a => ({
    claimKey: a.claimKey, eventId: a.eventId, reason: a.reason, supportedValue: a.effectiveValue,
    conflict: changedOrRewired(before.get(a.claimKey), after.get(a.claimKey)),
    message: changedOrRewired(before.get(a.claimKey), after.get(a.claimKey)) ? 'The target value or lineage changed. Review this overlap before explicit reapplication.' : 'No direct target change detected; supporting evidence and downstream effects still require review before explicit reapplication.',
  }));
  return {
    from: { id: fromId, at: from.computed_at, trigger: from.trigger, summary: from.summary },
    to: { id: toId, at: to.computed_at, trigger: to.trigger, summary: to.summary },
    rows, overlaps,
    addedDocuments: to.documents_used.filter(d => !from.documents_used.includes(d)),
    supersededDocuments: to.documents_superseded,
    declaredChangeCount: versions.indexOf(to) === versions.indexOf(from) + 1 && Array.isArray(to.changes_from_previous) ? to.changes_from_previous.length : null,
  };
}

type ScenarioJurisdiction = { base: Record<string, number>; alternative: Record<string, number>; total_tax_change: number; penalty_change?: number };
type SuppliedScenario = { id: string; description: string; base_version: string; choices: Record<string, string>; federal: ScenarioJurisdiction; california: ScenarioJurisdiction; changed_lines: Array<{ key: string; change: string; old: number; new: number }> };

export function projectScenarios(selectedId?: string) {
  const packet = getPacket();
  const alternatives = packet.what_if.alternatives as SuppliedScenario[];
  const baseline = packet.return_versions.find(v => v.version === 'v3')!;
  const selected = selectedId === undefined ? alternatives[0] : alternatives.find(a => a.id === selectedId);
  if (!selected) return null;
  // Fail closed if packet baseline no longer matches the stated scenario baseline.
  const baselineMatches = selected.base_version === 'v3' && ['federal', 'california'].every(j => {
    const jurisdiction = j as 'federal' | 'california';
    return Object.entries(selected[jurisdiction].base).every(([k, value]) => baseline.summary[jurisdiction][k] === value);
  });
  return {
    options: alternatives.map(a => ({ id: a.id, description: a.description })),
    selected,
    baselineMatches,
    baseline: { version: baseline.version, at: baseline.computed_at, summary: baseline.summary },
    mode: 'supplied_single_alternative' as const,
    appliedToWorkingReturn: false as const,
  };
}
