import 'server-only';
import type { StoredEvent } from '@/lib/events/types';
import { persona } from '@/lib/security/policy';
import { reduceEvents } from '@/lib/events/reducer';

export function collaborationView(events: StoredEvent[], actorId: string) {
  const actor = persona(actorId);
  const isClient = actor?.role === 'client';
  const isAdmin = actor?.role === 'firm_administrator';
  const questions = events.flatMap(e => {
    if (e.payload.kind !== 'question_created' || isAdmin || (isClient && e.payload.clientId !== actorId)) return [];
    const q = e.payload;
    const resolution = [...events].reverse().find(r => r.payload.kind === 'question_resolved' && r.payload.questionId === e.id);
    return [{ id: e.id, clientId: q.clientId, claimKey: q.claimKey, text: q.text, actorId: e.actorId, resolved: !!resolution,
      resolution: resolution?.payload.kind === 'question_resolved' ? resolution.payload.resolution : undefined,
      answers: events.flatMap(a => {
        if (a.payload.kind !== 'answer_recorded' || a.payload.questionId !== e.id) return [];
        // Unknown uploads remain restricted. No text, name or bytes reach uncleared staff.
        return [{ id: a.id, actorId: a.actorId, text: a.payload.text, attachment: actor?.cleared || a.actorId === actorId ? a.payload.attachment : a.payload.attachment ? { name: 'Restricted attachment', text: '', classification: 'restricted' as const } : undefined }];
      }) }];
  });
  const current = events.length ? reduceEvents(events[0].workspaceId, events[0].branchId, events).assignments : {};
  const assignments = Object.values(current).filter(assignment => !assignment.reversed && assignment.assigneeId === actorId).map(assignment => ({ id:assignment.eventId, scope:assignment.scopeKey }));
  return { questions, assignments, notices: [ ...questions.filter(q => !q.resolved && (isClient ? q.answers.length === 0 : q.answers.length > 0)).map(q => ({ id:q.id, text:isClient ? 'A question needs your answer' : 'A client answer needs review' })), ...assignments.map(a => ({ id:a.id, text:`Assigned to you: ${a.scope}` })) ] };
}
