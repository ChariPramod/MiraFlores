import { getExtractedValue, getLinesUsingDocument } from "@/lib/packet/indexes";
import {
  claimFingerprint,
  materialDependents,
  scopeKey,
  verificationFingerprint,
} from "./fingerprint";
import type {
  StoredEvent,
  WorkspaceProjection,
} from "./types";

export function emptyProjection(
  workspaceId: string,
  branchId = "main",
): WorkspaceProjection {
  return {
    workspaceId,
    branchId,
    sequence: 0,
    claimRevisions: {},
    documentRevisions: {},
    adjustments: {},
    notes: [],
    verifications: {},
    signoffs: {},
    dispositions: {},
    assignments: {},
    reversedEventIds: [],
    eventIds: [],
  };
}

function bumpClaimRevision(
  state: WorkspaceProjection,
  claimKey: string,
): number {
  const next = (state.claimRevisions[claimKey] ?? 0) + 1;
  state.claimRevisions[claimKey] = next;
  return next;
}

function reopenAffectedSignoffs(
  state: WorkspaceProjection,
  claimKey: string,
  version: string,
  reason: string,
): void {
  // Conservatively invalidate the affected area when material state changes.
  // Fingerprint mismatch covers the adjusted claim; dependents may still omit
  // working values from incomplete engine lineage — reopen them anyway.
  const affected = materialDependents(claimKey, version);
  for (const key of affected) {
    const sk = scopeKey(version, key);
    const signoff = state.signoffs[sk];
    if (!signoff || signoff.status !== "active") continue;
    const currentFp = claimFingerprint(key, version, state);
    if (key === claimKey && currentFp === signoff.fingerprint) continue;
    state.signoffs[sk] = {
      ...signoff,
      status: "reopened",
      reopenReason: reason,
    };
  }

  for (const key of affected) {
    const sk = scopeKey(version, key);
    const ver = state.verifications[sk];
    if (!ver || !ver.open) continue;
    const currentFp = verificationFingerprint(key, version, state);
    if (key === claimKey && currentFp === ver.checkedFingerprint) continue;
    state.verifications[sk] = { ...ver, open: false };
  }
}

function invalidateDocument(state: WorkspaceProjection, documentId: string, reason: string) {
  const refs = new Set(getLinesUsingDocument(documentId));
  for (const adj of Object.values(state.adjustments)) {
    if (!adj.reversed && adj.evidenceRefs.some(ref => ref === documentId || /^(?:doc:)?(D\d+)(?:#page\d+)?$/.exec(ref)?.[1] === documentId || getExtractedValue(ref)?.document_id === documentId)) refs.add(`${adj.engineVersion}:${adj.claimKey}`);
  }
  for (const ref of refs) {
    const [version, key] = ref.split(":");
    reopenAffectedSignoffs(state, key, version, reason);
  }
}

function applyOne(
  state: WorkspaceProjection,
  event: StoredEvent,
  history: StoredEvent[],
): WorkspaceProjection {
  if (state.eventIds.includes(event.id)) {
    return state;
  }
  if (event.sequence !== state.sequence + 1) {
    throw new Error(
      `Event sequence gap: expected ${state.sequence + 1}, got ${event.sequence}`,
    );
  }

  const next: WorkspaceProjection = {
    ...state,
    sequence: event.sequence,
    claimRevisions: { ...state.claimRevisions },
    documentRevisions: { ...state.documentRevisions },
    adjustments: { ...state.adjustments },
    notes: [...state.notes],
    verifications: { ...state.verifications },
    signoffs: { ...state.signoffs },
    dispositions: { ...state.dispositions },
    assignments: { ...state.assignments },
    reversedEventIds: [...state.reversedEventIds],
    eventIds: [...state.eventIds, event.id],
  };

  const payload = event.payload;

  switch (payload.kind) {
    case "adjustment_recorded": {
      const sk = scopeKey(payload.engineVersion, payload.claimKey);
      const revision = bumpClaimRevision(next, payload.claimKey);
      next.adjustments[sk] = {
        claimKey: payload.claimKey,
        engineVersion: payload.engineVersion,
        field: payload.field,
        originalValue: payload.originalValue,
        effectiveValue: payload.effectiveValue,
        workingGain: payload.workingGain,
        category: payload.category,
        effectMethod: payload.effectMethod,
        estimatedFederalEffect: payload.estimatedFederalEffect,
        estimatedCaliforniaEffect: payload.estimatedCaliforniaEffect,
        effectLimitations: payload.effectLimitations,
        evidenceRefs: event.evidenceRefs,
        reason: event.reason ?? "",
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        revision,
        reversed: false,
      };
      reopenAffectedSignoffs(
        next,
        payload.claimKey,
        payload.engineVersion,
        `Material adjustment on ${payload.claimKey}`,
      );
      break;
    }
    case "verification_recorded": {
      const sk = scopeKey(payload.engineVersion, payload.claimKey);
      const revision = bumpClaimRevision(next, payload.claimKey);
      next.verifications[sk] = {
        claimKey: payload.claimKey,
        engineVersion: payload.engineVersion,
        method: payload.method,
        conclusion: payload.conclusion,
        checkedFingerprint: payload.checkedFingerprint,
        evidenceRefs: event.evidenceRefs,
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        revision,
        open: true,
      };
      // Verification conclusions are material to approvals. The just-recorded
      // verification remains open; only prior approval state is invalidated.
      const currentVerification = next.verifications[sk];
      reopenAffectedSignoffs(next, payload.claimKey, payload.engineVersion, "Verification changed");
      next.verifications[sk] = currentVerification;
      break;
    }
    case "note_created": {
      next.notes.push({
        noteId: payload.noteId,
        claimKey: payload.claimKey,
        text: payload.text,
        visibility: payload.visibility,
        blocking: payload.blocking,
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        resolved: false,
      });
      // Notes do not bump claim fingerprint / reopen sign-offs.
      break;
    }
    case "note_resolved": {
      next.notes = next.notes.map((n) =>
        n.noteId === payload.noteId
          ? {
              ...n,
              resolved: true,
              resolution: payload.resolution,
            }
          : n,
      );
      break;
    }
    case "signoff_recorded": {
      const sk = scopeKey(payload.engineVersion, payload.claimKey);
      const revision = bumpClaimRevision(next, payload.claimKey);
      next.signoffs[sk] = {
        claimKey: payload.claimKey,
        engineVersion: payload.engineVersion,
        level: payload.level,
        fingerprint: payload.fingerprint,
        policyVersion: payload.policyVersion,
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        revision,
        status: "active",
      };
      break;
    }
    case "document_disposition_recorded": {
      next.documentRevisions[payload.documentId] =
        (next.documentRevisions[payload.documentId] ?? 0) + 1;
      next.dispositions[payload.documentId] = {
        documentId: payload.documentId,
        disposition: payload.disposition,
        explanation: payload.explanation,
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        reversed: false,
      };
      invalidateDocument(next, payload.documentId, "Document disposition changed");
      break;
    }
    case "assignment_changed": {
      next.assignments[payload.scopeKey] = {
        scopeKey: payload.scopeKey,
        assigneeId: payload.assigneeId,
        previousAssigneeId: payload.previousAssigneeId,
        area: payload.area,
        actorId: event.actorId,
        eventId: event.id,
        sequence: event.sequence,
        reversed: false,
      };
      break;
    }
    case "event_reversed": {
      next.reversedEventIds.push(payload.originalEventId);
      // Find original in history via prior projection fields
      compensate(next, payload.originalEventId, event, history);
      break;
    }
    default:
      break;
  }

  return next;
}

function compensate(
  state: WorkspaceProjection,
  originalEventId: string,
  reversal: StoredEvent,
  history: StoredEvent[],
): void {
  // Restore the latest surviving decision, not the packet baseline. Earlier
  // events remain untouched, and reversal/revision history stays monotonic.
  const prior = (match: (event: StoredEvent) => boolean) => [...history].reverse().find(event =>
    event.sequence < reversal.sequence && !state.reversedEventIds.includes(event.id) && match(event),
  );
  for (const [sk, adj] of Object.entries(state.adjustments)) {
    if (adj.eventId === originalEventId && !adj.reversed) {
      const previous = prior(event => event.payload.kind === "adjustment_recorded" && event.payload.engineVersion === adj.engineVersion && event.payload.claimKey === adj.claimKey);
      const revision = bumpClaimRevision(state, adj.claimKey);
      state.adjustments[sk] = previous?.payload.kind === "adjustment_recorded" ? {
        ...adj,
        field: previous.payload.field,
        originalValue: previous.payload.originalValue,
        effectiveValue: previous.payload.effectiveValue,
        workingGain: previous.payload.workingGain,
        category: previous.payload.category,
        effectMethod: previous.payload.effectMethod,
        estimatedFederalEffect: previous.payload.estimatedFederalEffect,
        estimatedCaliforniaEffect: previous.payload.estimatedCaliforniaEffect,
        effectLimitations: previous.payload.effectLimitations,
        reason: previous.reason ?? "",
        evidenceRefs: previous.evidenceRefs,
        actorId: previous.actorId,
        eventId: previous.id,
        sequence: previous.sequence,
        revision,
        reversed: false,
      } : { ...adj, revision, reversed: true };
      reopenAffectedSignoffs(
        state,
        adj.claimKey,
        adj.engineVersion,
        `Adjustment undone (${reversal.id})`,
      );
    }
  }
  for (const [sk, ver] of Object.entries(state.verifications)) {
    if (ver.eventId === originalEventId) {
      state.verifications[sk] = { ...ver, open: false };
      bumpClaimRevision(state, ver.claimKey);
      reopenAffectedSignoffs(state, ver.claimKey, ver.engineVersion, "Verification undone");
    }
  }
  for (const [sk, sig] of Object.entries(state.signoffs)) {
    if (sig.eventId === originalEventId) {
      state.signoffs[sk] = {
        ...sig,
        status: "reopened",
        reopenReason: "Sign-off event reversed",
      };
      bumpClaimRevision(state, sig.claimKey);
    }
  }
  for (const [docId, disp] of Object.entries(state.dispositions)) {
    if (disp.eventId === originalEventId && !disp.reversed) {
      const previous = prior(event => event.payload.kind === "document_disposition_recorded" && event.payload.documentId === docId);
      state.dispositions[docId] = previous?.payload.kind === "document_disposition_recorded" ? {
        ...disp,
        disposition: previous.payload.disposition,
        explanation: previous.payload.explanation,
        actorId: previous.actorId,
        eventId: previous.id,
        sequence: previous.sequence,
        reversed: false,
      } : { ...disp, reversed: true };
      state.documentRevisions[docId] = (state.documentRevisions[docId] ?? 0) + 1;
      invalidateDocument(state, docId, "Document disposition undone");
    }
  }
  for (const [scope, asg] of Object.entries(state.assignments)) {
    if (asg.eventId === originalEventId && !asg.reversed) {
      const previous = prior(event => event.payload.kind === "assignment_changed" && event.payload.scopeKey === scope);
      state.assignments[scope] = previous?.payload.kind === "assignment_changed" ? {
        ...asg,
        assigneeId: previous.payload.assigneeId,
        previousAssigneeId: previous.payload.previousAssigneeId,
        area: previous.payload.area,
        actorId: previous.actorId,
        eventId: previous.id,
        sequence: previous.sequence,
        reversed: false,
      } : { ...asg, reversed: true };
    }
  }
  state.notes = state.notes.map((n) =>
    n.eventId === originalEventId
      ? { ...n, resolved: true, resolution: "Note creation reversed" }
      : n,
  );
  const original = history.find(event => event.id === originalEventId);
  if (original?.payload.kind === "note_resolved") {
    const noteId = original.payload.noteId;
    const resolution = prior(event => event.payload.kind === "note_resolved" && event.payload.noteId === noteId);
    state.notes = state.notes.map(note => note.noteId !== noteId || state.reversedEventIds.includes(note.eventId) ? note : {
      ...note,
      resolved: !!resolution,
      resolution: resolution?.payload.kind === "note_resolved" ? resolution.payload.resolution : undefined,
    });
  }
}

/** Deterministic fold of append-only events into workspace projection. */
export function reduceEvents(
  workspaceId: string,
  branchId: string,
  events: StoredEvent[],
): WorkspaceProjection {
  let state = emptyProjection(workspaceId, branchId);
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  for (const event of ordered) {
    if (event.workspaceId !== workspaceId || event.branchId !== branchId) {
      throw new Error("Event workspace/branch mismatch during reduce");
    }
    state = applyOne(state, event, ordered);
  }
  return state;
}
