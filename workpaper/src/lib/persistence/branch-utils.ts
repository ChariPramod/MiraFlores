import { StoredEventSchema, type StoredEvent } from '@/lib/events/types';
import type { AppendEventsInput, AppendEventsResult, CreateBranchInput } from './store';

/** Virtual inherited history retains original event IDs and actor attribution. */
export function inheritedEvents(events: StoredEvent[], branchId: string): StoredEvent[] {
  return events.map(event => StoredEventSchema.parse({ ...event, branchId, inheritedFromBranchId:event.inheritedFromBranchId ?? event.branchId,
    targetRefs: event.targetRefs.map(ref => ({ ...ref, branchId })) }));
}
export function branchValidation(input: CreateBranchInput, parentEvents: StoredEvent[]): string | null {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.branch.id) || input.branch.id === 'main') return 'Invalid child branch ID';
  const snapshot = parentEvents.find(e => e.payload.kind === 'snapshot_created' && e.payload.snapshot.id === input.branch.parentSnapshotId)?.payload;
  if (!snapshot || snapshot.kind !== 'snapshot_created') return 'Parent snapshot not found in this workspace';
  if (snapshot.snapshot.branchId !== input.branch.parentBranchId) return 'Parent snapshot branch mismatch';
  const expected = parentEvents.filter(e => e.sequence <= snapshot.snapshot.eventCutoff);
  if (JSON.stringify(expected) !== JSON.stringify(input.baseEvents)) return 'Inherited history must exactly match the frozen snapshot cutoff';
  if (input.baseEvents.some(e => e.workspaceId !== input.workspaceId)) return 'Inherited history workspace mismatch';
  return null;
}
export function frozenDenial(history: StoredEvent[], input: AppendEventsInput): AppendEventsResult | null {
  if (history.some(e => e.type === 'filing_attempt_recorded') && input.events.some(e => e.type !== 'filing_attempt_recorded')) {
    return { ok: false, code: 'validation', message: 'This branch is frozen after a simulated submission. Open a successor draft after rejection or an amendment after acceptance.' };
  }
  return null;
}
