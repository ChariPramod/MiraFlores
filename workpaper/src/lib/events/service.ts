import "server-only";

import { resolveRef } from "@/lib/packet/resolve";
import { containsSensitive } from "@/lib/security/redaction";
import { persona } from "@/lib/security/policy";
import { commandDenial } from "@/lib/security/policy";
import { validWorkspaceId } from "@/lib/security/tokens";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  DEFAULT_AS_OF,
  refAvailableAt,
} from "@/lib/packet/availability";
import { getLine } from "@/lib/packet/indexes";
import { getEventStore } from "@/lib/persistence/get-store";
import type { EventStore } from "@/lib/persistence/store";
import { CommandSchema, type Command } from "./commands";
import { claimFingerprint, verificationFingerprint, scopeKey } from "./fingerprint";
import { reduceEvents } from "./reducer";
import {
  estimateTaxEffect,
  lotWorkingGain,
} from "./tax-effect";
import {
  POLICY_VERSION,
  type StoredEvent,
  type WorkspaceProjection,
} from "./types";

export type CommandResult =
  | {
      ok: true;
      projection: WorkspaceProjection;
      events: StoredEvent[];
      deduped: boolean;
    }
  | {
      ok: false;
      code: "stale" | "conflict" | "isolation" | "validation" | "unavailable" | "forbidden";
      message: string;
      currentSequence?: number;
      currentRevision?: number;
    };

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadProjection(
  workspaceId: string,
  branchId = "main",
  store: EventStore = getEventStore(),
): Promise<WorkspaceProjection> {
  await store.ensureWorkspace(workspaceId);
  const events = await store.listEvents(workspaceId, branchId);
  return reduceEvents(workspaceId, branchId, events);
}

/**
 * Enforce that the cookie workspace is the only one a visitor may mutate.
 */
export function assertWorkspaceAccess(
  sessionWorkspaceId: string,
  commandWorkspaceId: string,
): CommandResult | null {
  if (sessionWorkspaceId !== commandWorkspaceId) {
    return {
      ok: false,
      code: "isolation",
      message: "Workspace isolation violation",
    };
  }
  if (!validWorkspaceId(sessionWorkspaceId)) {
    return {
      ok: false,
      code: "isolation",
      message: "Invalid workspace session",
    };
  }
  return null;
}

export async function executeCommand(options: {
  command: Command;
  actorId: string;
  sessionWorkspaceId: string;
  asOf?: string;
  store?: EventStore;
}): Promise<CommandResult> {
  const store = options.store ?? getEventStore();
  const asOf = options.asOf ?? DEFAULT_AS_OF;
  const parsed = CommandSchema.safeParse(options.command);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.message,
    };
  }
  const command = parsed.data;
  const isolation = assertWorkspaceAccess(
    options.sessionWorkspaceId,
    command.workspaceId,
  );
  if (isolation) return isolation;

  await store.ensureWorkspace(command.workspaceId);
  const projection = await loadProjection(
    command.workspaceId,
    command.branchId,
    store,
  );

  const history = await store.listEvents(command.workspaceId, command.branchId);
  const denial = commandDenial(command, options.actorId, history, asOf);
  if (denial) return { ok: false, code: "forbidden", message: denial };
  if ("claimKey" in command && command.claimKey && !getLine(command.claimKey, "engineVersion" in command ? command.engineVersion : "v3")) return { ok: false, code: "validation", message: "Unknown claim" };
  const refs = "evidenceRefs" in command ? command.evidenceRefs : "documentId" in command ? [command.documentId] : [];
  const validRef = (ref: string) => ref.startsWith("answer:")
    ? history.some(e => e.id === ref.slice(7) && e.payload.kind === "answer_recorded" && e.effectiveAt <= asOf)
    : refAvailableAt(ref, asOf) && resolveRef(ref, { version: "engineVersion" in command ? command.engineVersion : "v3" }).kind !== "missing";
  if (refs.some(ref => !validRef(ref))) return { ok: false, code: "unavailable", message: "Evidence is missing or not available at this simulation date" };

  if (!persona(options.actorId, asOf)?.cleared && refs.some(ref => ref.startsWith("answer:")
    ? containsSensitive(history.find(e => e.id === ref.slice(7))?.payload)
    : containsSensitive(resolveRef(ref)))) return { ok: false, code: "forbidden", message: "Sensitive evidence requires clearance before verification or adjustment" };

  // Idempotent retries must short-circuit before stale revision/sequence checks.
  const idempotencyKey =
    "idempotencyKey" in command ? command.idempotencyKey : undefined;
  if (idempotencyKey) {
    const prior = await store.listEvents(command.workspaceId, command.branchId);
    const hit = prior.find((e) => e.idempotencyKey === idempotencyKey);
    if (hit?.inheritedFromBranchId) return { ok:false, code:"conflict", message:"Idempotency key belongs to inherited history; start a new command" };
    if (hit && hit.actorId !== options.actorId) return { ok: false, code: "conflict", message: "Idempotency key belongs to another actor" };
    if (hit) {
      const batch = hit.batchId
        ? prior.filter((e) => e.batchId === hit.batchId)
        : [hit];
      return {
        ok: true,
        projection,
        events: batch,
        deduped: true,
      };
    }
  }

  const envelopeBase = {
    workspaceId: command.workspaceId,
    branchId: command.branchId,
    actorId: options.actorId,
    recordedAt: nowIso(),
    effectiveAt: asOf,
  };

  try {
    switch (command.type) {
      case "ask_question":
      case "record_answer":
      case "resolve_question":
      case "resolve_note": {
        const payload: StoredEvent["payload"] = command.type === "ask_question"
          ? { kind: "question_created", clientId: command.clientId, claimKey: command.claimKey, text: command.text }
          : command.type === "record_answer"
            ? { kind: "answer_recorded", questionId: command.questionId, text: command.text, attachment: command.attachment ? { ...command.attachment, classification: "restricted" } : undefined }
            : command.type === "resolve_question"
              ? { kind: "question_resolved", questionId: command.questionId, resolution: command.resolution }
              : { kind: "note_resolved", noteId: command.noteId, resolution: command.resolution };
        return commit(store, command.workspaceId, command.branchId, [{ id: `evt_${randomUUID()}`, ...envelopeBase, type: payload.kind, payload, targetRefs: [], evidenceRefs: [], idempotencyKey: command.idempotencyKey }], command.expectedBranchSequence ?? projection.sequence, projection);
      }
      case "record_adjustment":
        return await handleAdjustment(
          command,
          projection,
          envelopeBase,
          store,
          asOf,
        );
      case "record_verification":
        return await handleVerification(
          command,
          projection,
          envelopeBase,
          store,
        );
      case "record_note":
        return await handleNote(command, projection, envelopeBase, store);
      case "record_signoff":
        return await handleSignoff(command, projection, envelopeBase, store);
      case "record_disposition":
        return await handleDisposition(
          command,
          projection,
          envelopeBase,
          store,
        );
      case "undo_event":
        return await handleUndo(command, projection, envelopeBase, store);
      case "bulk_assign":
        return await handleBulkAssign(
          command,
          projection,
          envelopeBase,
          store,
        );
      case "bulk_undo":
        return await handleBulkUndo(command, projection, envelopeBase, store);
      default:
        return { ok: false, code: "validation", message: "Unknown command" };
    }
  } catch (err) {
    return {
      ok: false,
      code: "validation",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function commit(
  store: EventStore,
  workspaceId: string,
  branchId: string,
  partials: Omit<StoredEvent, "sequence">[],
  expectedBranchSequence: number | undefined,
  prior: WorkspaceProjection,
): Promise<CommandResult> {
  const result = await store.appendEvents({
    workspaceId,
    branchId,
    events: partials,
    expectedBranchSequence,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      currentSequence: result.currentSequence,
    };
  }
  if (result.deduped) {
    const events = await store.listEvents(workspaceId, branchId);
    return {
      ok: true,
      projection: reduceEvents(workspaceId, branchId, events),
      events: result.events,
      deduped: true,
    };
  }
  const projection = reduceEvents(workspaceId, branchId, [
    ...(await store.listEvents(workspaceId, branchId).then((all) =>
      all.filter((e) => e.sequence <= prior.sequence),
    )),
    ...result.events,
  ]);
  // Safer: reload full stream
  const all = await store.listEvents(workspaceId, branchId);
  return {
    ok: true,
    projection: reduceEvents(workspaceId, branchId, all),
    events: result.events,
    deduped: false,
  };
}

async function handleAdjustment(
  command: Extract<Command, { type: "record_adjustment" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
  asOf: string,
): Promise<CommandResult> {
  const currentRev = projection.claimRevisions[command.claimKey] ?? 0;
  if (command.expectedRevision !== currentRev) {
    return {
      ok: false,
      code: "stale",
      message: `Stale adjustment: expected revision ${command.expectedRevision}, current ${currentRev}`,
      currentRevision: currentRev,
      currentSequence: projection.sequence,
    };
  }

  for (const ref of command.evidenceRefs) {
    if (!refAvailableAt(ref, asOf)) {
      return {
        ok: false,
        code: "unavailable",
        message: `Evidence ${ref} is not available at simulation as-of ${asOf.slice(0, 10)}`,
      };
    }
  }

  const line = getLine(command.claimKey, command.engineVersion);
  if (!line) {
    return {
      ok: false,
      code: "validation",
      message: `Unknown claim ${command.claimKey}`,
    };
  }

  let originalValue: number | null =
    typeof line.value === "number" ? line.value : null;
  let workingGain: number | undefined;
  let deltaTaxable = 0;

  if (command.field === "basis" && command.claimKey.startsWith("F8949.")) {
    const proceedsMatch = /proceeds\s+([\d,]+\.?\d*)/i.exec(line.label);
    const basisMatch = /basis\s+([\d,]+\.?\d*)/i.exec(line.label);
    const proceeds = proceedsMatch
      ? Number(proceedsMatch[1].replace(/,/g, ""))
      : null;
    const engineBasis = basisMatch
      ? Number(basisMatch[1].replace(/,/g, ""))
      : 0;
    originalValue = engineBasis;
    if (proceeds === null) {
      return {
        ok: false,
        code: "validation",
        message: "Cannot derive proceeds for lot basis adjustment",
      };
    }
    const engineGain =
      typeof line.value === "number"
        ? line.value
        : lotWorkingGain(proceeds, engineBasis);
    workingGain = lotWorkingGain(proceeds, command.effectiveValue);
    deltaTaxable = new Decimal(workingGain)
      .minus(engineGain)
      .toDecimalPlaces(2)
      .toNumber();
  } else {
    const engine =
      typeof line.value === "number" ? line.value : command.effectiveValue;
    originalValue = typeof line.value === "number" ? line.value : null;
    deltaTaxable = new Decimal(command.effectiveValue)
      .minus(engine)
      .toDecimalPlaces(2)
      .toNumber();
  }

  const estimate = estimateTaxEffect({
    version: command.engineVersion,
    method: command.effectMethod,
    deltaTaxable,
  });

  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "adjustment_recorded",
    targetRefs: [
      {
        packetRef: command.claimKey,
        engineVersion: command.engineVersion,
        branchId: command.branchId,
      },
    ],
    evidenceRefs: command.evidenceRefs,
    reason: command.reason,
    idempotencyKey: command.idempotencyKey,
    payload: {
      kind: "adjustment_recorded",
      claimKey: command.claimKey,
      engineVersion: command.engineVersion,
      field: command.field,
      unit: "money",
      originalValue,
      effectiveValue: command.effectiveValue,
      workingGain,
      category: command.category,
      effectMethod: command.effectMethod,
      estimatedFederalEffect: estimate.federalEffect,
      estimatedCaliforniaEffect: estimate.californiaEffect,
      effectLimitations: estimate.limitations,
      expectedRevision: command.expectedRevision,
    },
  };

  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleVerification(
  command: Extract<Command, { type: "record_verification" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const currentRev = projection.claimRevisions[command.claimKey] ?? 0;
  if (command.expectedRevision !== currentRev) {
    return {
      ok: false,
      code: "stale",
      message: `Stale verification: expected revision ${command.expectedRevision}, current ${currentRev}`,
      currentRevision: currentRev,
      currentSequence: projection.sequence,
    };
  }
  const fp = verificationFingerprint(
    command.claimKey,
    command.engineVersion,
    projection,
  );
  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "verification_recorded",
    targetRefs: [
      {
        packetRef: command.claimKey,
        engineVersion: command.engineVersion,
        branchId: command.branchId,
      },
    ],
    evidenceRefs: command.evidenceRefs,
    reason: command.reason,
    idempotencyKey: command.idempotencyKey,
    payload: {
      kind: "verification_recorded",
      claimKey: command.claimKey,
      engineVersion: command.engineVersion,
      method: command.method,
      conclusion: command.conclusion,
      checkedFingerprint: fp,
      expectedRevision: command.expectedRevision,
    },
  };
  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleNote(
  command: Extract<Command, { type: "record_note" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const noteId = `note_${randomUUID()}`;
  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "note_created",
    targetRefs: command.claimKey
      ? [
          {
            packetRef: command.claimKey,
            branchId: command.branchId,
          },
        ]
      : [],
    evidenceRefs: [],
    idempotencyKey: command.idempotencyKey,
    payload: {
      kind: "note_created",
      noteId,
      claimKey: command.claimKey,
      text: command.text,
      visibility: command.visibility,
      blocking: command.blocking,
    },
  };
  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleSignoff(
  command: Extract<Command, { type: "record_signoff" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const currentRev = projection.claimRevisions[command.claimKey] ?? 0;
  if (command.expectedRevision !== currentRev) {
    return {
      ok: false,
      code: "stale",
      message: `Stale sign-off: expected revision ${command.expectedRevision}, current ${currentRev}`,
      currentRevision: currentRev,
      currentSequence: projection.sequence,
    };
  }
  const fp = claimFingerprint(
    command.claimKey,
    command.engineVersion,
    projection,
  );
  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "signoff_recorded",
    targetRefs: [
      {
        packetRef: command.claimKey,
        engineVersion: command.engineVersion,
        branchId: command.branchId,
      },
    ],
    evidenceRefs: [],
    reason: command.reason,
    idempotencyKey: command.idempotencyKey,
    payload: {
      kind: "signoff_recorded",
      claimKey: command.claimKey,
      engineVersion: command.engineVersion,
      level: command.level,
      fingerprint: fp,
      policyVersion: POLICY_VERSION,
      expectedRevision: command.expectedRevision,
    },
  };
  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleDisposition(
  command: Extract<Command, { type: "record_disposition" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "document_disposition_recorded",
    targetRefs: [
      {
        packetRef: command.documentId,
        branchId: command.branchId,
      },
    ],
    evidenceRefs: [command.documentId],
    reason: command.explanation,
    idempotencyKey: command.idempotencyKey,
    payload: {
      kind: "document_disposition_recorded",
      documentId: command.documentId,
      disposition: command.disposition,
      explanation: command.explanation,
    },
  };
  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleUndo(
  command: Extract<Command, { type: "undo_event" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const all = await store.listEvents(command.workspaceId, command.branchId);
  const original = all.find((e) => e.id === command.eventId);
  if (!original) {
    return { ok: false, code: "validation", message: "Event not found" };
  }
  if (projection.reversedEventIds.includes(original.id)) {
    return {
      ok: false,
      code: "validation",
      message: "Event already reversed",
    };
  }
  if (original.type === "event_reversed") {
    return {
      ok: false,
      code: "validation",
      message: "Cannot reverse a reversal event",
    };
  }
  const event: Omit<StoredEvent, "sequence"> = {
    id: `evt_${randomUUID()}`,
    ...envelopeBase,
    type: "event_reversed",
    targetRefs: original.targetRefs,
    evidenceRefs: original.evidenceRefs,
    reason: command.reason,
    idempotencyKey: command.idempotencyKey,
    reversesEventId: original.id,
    payload: {
      kind: "event_reversed",
      originalEventId: original.id,
      compensatingSummary: `Reverses ${original.type} ${original.id}`,
    },
  };
  return commit(
    store,
    command.workspaceId,
    command.branchId,
    [event],
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleBulkAssign(
  command: Extract<Command, { type: "bulk_assign" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const batchId = `batch_${randomUUID()}`;
  const partials: Omit<StoredEvent, "sequence">[] = command.scopeKeys.map(
    (scopeKeyValue, index) => {
      const existing = projection.assignments[scopeKeyValue];
      return {
        id: `evt_${randomUUID()}`,
        ...envelopeBase,
        type: "assignment_changed" as const,
        targetRefs: [
          {
            packetRef: scopeKeyValue,
            branchId: command.branchId,
          },
        ],
        evidenceRefs: [],
        reason: command.reason,
        idempotencyKey:
          index === 0 ? command.idempotencyKey : `${command.idempotencyKey}:${index}`,
        batchId,
        payload: {
          kind: "assignment_changed" as const,
          scopeKey: scopeKeyValue,
          previousAssigneeId: existing && !existing.reversed
            ? existing.assigneeId
            : null,
          assigneeId: command.assigneeId,
          area: command.area,
        },
      };
    },
  );

  return commit(
    store,
    command.workspaceId,
    command.branchId,
    partials,
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

async function handleBulkUndo(
  command: Extract<Command, { type: "bulk_undo" }>,
  projection: WorkspaceProjection,
  envelopeBase: {
    workspaceId: string;
    branchId: string;
    actorId: string;
    recordedAt: string;
    effectiveAt: string;
  },
  store: EventStore,
): Promise<CommandResult> {
  const all = await store.listEvents(command.workspaceId, command.branchId);
  const batch = all.filter((e) => e.batchId === command.batchId);
  if (!batch.length) {
    return { ok: false, code: "validation", message: "Batch not found" };
  }
  const reversible = batch.filter(
    (e) =>
      e.type !== "event_reversed" &&
      !projection.reversedEventIds.includes(e.id),
  );
  if (!reversible.length) {
    return {
      ok: false,
      code: "validation",
      message: "Batch already fully reversed",
    };
  }

  const undoBatchId = `batch_${randomUUID()}`;
  const partials: Omit<StoredEvent, "sequence">[] = reversible.map(
    (original, index) => ({
      id: `evt_${randomUUID()}`,
      ...envelopeBase,
      type: "event_reversed" as const,
      targetRefs: original.targetRefs,
      evidenceRefs: original.evidenceRefs,
      reason: command.reason,
      idempotencyKey:
        index === 0
          ? command.idempotencyKey
          : `${command.idempotencyKey}:${index}`,
      batchId: undoBatchId,
      reversesEventId: original.id,
      payload: {
        kind: "event_reversed" as const,
        originalEventId: original.id,
        compensatingSummary: `Bulk undo of batch ${command.batchId}`,
      },
    }),
  );

  return commit(
    store,
    command.workspaceId,
    command.branchId,
    partials,
    command.expectedBranchSequence ?? projection.sequence,
    projection,
  );
}

export { scopeKey, claimFingerprint };
