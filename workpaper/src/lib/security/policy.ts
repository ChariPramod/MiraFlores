import 'server-only';
import { getPacket } from '@/lib/packet/load';
import type { Command } from '@/lib/events/commands';
import type { StoredEvent } from '@/lib/events/types';
import { materialDependents } from '@/lib/events/fingerprint';

export function persona(id: string, asOf = '2026-06-23') {
  const p = getPacket();
  const staff = p.firm.staff.find(s => s.id === id && s.active_from <= asOf.slice(0, 10));
  if (staff) return { id, name: staff.name, role: staff.role, cleared: staff.sensitive_data_clearance };
  const client = p.firm.client_users.find(c => c.id === id);
  return client ? { id, name: String(client.name), role: 'client', cleared: false } : null;
}
export function activePersonas(asOf = '2026-06-23') {
  return [...getPacket().firm.staff, ...getPacket().firm.client_users].map(s => persona(s.id, asOf)).filter(p => p !== null);
}
export function commandDenial(command: Command, actorId: string, events: StoredEvent[], asOf: string): string | null {
  const actor = persona(actorId, asOf);
  if (!actor) return 'Persona is unknown or not active at this simulation date.';
  const staff = ['preparer', 'reviewer', 'partner'].includes(actor.role);
  if (command.type === 'record_answer') {
    const question = events.find(e => e.id === command.questionId && e.payload.kind === 'question_created');
    if (!question || question.payload.kind !== 'question_created' || question.payload.clientId !== actorId || actor.role !== 'client') return 'Only the addressed client may answer this question.';
    if (events.some(e => e.payload.kind === 'question_resolved' && e.payload.questionId === command.questionId)) return 'Question is already resolved.';
    return null;
  }
  if (command.type === 'ask_question') return staff && persona(command.clientId, asOf)?.role === 'client' ? null : 'Only tax staff may ask an active client a question.';
  if (command.type === 'resolve_question') return staff && events.some(e => e.id === command.questionId && e.type === 'question_created') ? null : 'Only tax staff may resolve an existing question.';
  if (command.type === 'resolve_note') return staff && events.some(e => e.payload.kind === 'note_created' && e.payload.noteId === command.noteId) ? null : 'Only tax staff may resolve an existing review note.';
  if (command.type === 'bulk_assign') return (staff || actor.role === 'firm_administrator') && ['preparer','reviewer','partner'].includes(persona(command.assigneeId, asOf)?.role ?? '') ? null : 'Assignment requires an active tax staff assignee and an authorized actor.';
  if (command.type === 'bulk_undo' && actor.role === 'firm_administrator') {
    const targets = events.filter(e => e.batchId === command.batchId);
    return targets.length && targets.every(e => e.actorId === actorId && e.type === 'assignment_changed') ? null : 'Administrators may undo only their own assignments.';
  }
  if (!staff) return 'This persona cannot change tax workpapers.';
  if (command.type === 'record_signoff') {
    if (actor.role !== command.level) return 'Sign-off level must match the acting persona role.';
    const baselinePreparer = getPacket().firm.assignment_at_start as { preparer?: string } | undefined;
    const prepared = baselinePreparer?.preparer === actorId || events.some(e => e.actorId === actorId && (e.payload.kind === 'adjustment_recorded' || e.payload.kind === 'verification_recorded') && e.payload.engineVersion === command.engineVersion && materialDependents(e.payload.claimKey, command.engineVersion).includes(command.claimKey));
    if (prepared) return 'Separation of duties: you cannot sign work you prepared, including dependent totals.';
  }
  if (command.type === 'undo_event' || command.type === 'bulk_undo') {
    const targets = events.filter(e => command.type === 'undo_event' ? e.id === command.eventId : e.batchId === command.batchId);
    if (!targets.length || targets.some(e => e.actorId !== actorId || ['question_created','answer_recorded','question_resolved','access_logged','event_reversed','snapshot_created','package_approval_recorded','filing_attempt_recorded','branch_created'].includes(e.type))) return 'Only your own reversible work may be undone.';
  }
  return null;
}
