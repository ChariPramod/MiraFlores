import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { claimFingerprint, scopeKey } from "@/lib/events/fingerprint";
import { reduceEvents, emptyProjection } from "@/lib/events/reducer";
import {
  assertWorkspaceAccess,
  executeCommand,
  loadProjection,
} from "@/lib/events/service";
import { estimateTaxEffect, lotWorkingGain } from "@/lib/events/tax-effect";
import { loadPacket } from "@/lib/packet/load";
import { projectClaim } from "@/lib/packet/projections";
import { MemoryEventStore } from "@/lib/persistence/memory-store";

function ws(): string {
  return `ws_${randomUUID()}`;
}

function key(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

describe("Day 3 events — N1 adjustment and persistence", () => {
  const stores: MemoryEventStore[] = [];

  afterEach(async () => {
    for (const store of stores) {
      // no global state; GC is enough
      void store;
    }
    stores.length = 0;
  });

  function store(): MemoryEventStore {
    const s = new MemoryEventStore();
    stores.push(s);
    return s;
  }

  it("computes N1 working gain 140 and labeled stcg tax effects once", () => {
    loadPacket();
    expect(lotWorkingGain(19240, 19100)).toBe(140);
    const delta = 140 - 19240;
    const estimate = estimateTaxEffect({
      version: "v3",
      method: "stcg",
      deltaTaxable: delta,
    });
    expect(estimate.fullyRecomputed).toBe(false);
    expect(estimate.labeled).toBe(true);
    expect(estimate.federalEffect).toBeCloseTo(delta * 0.348, 2);
    expect(estimate.californiaEffect).toBeCloseTo(delta * 0.034, 2);
    expect(estimate.limitations.some((l) => /not a fully recomputed/i.test(l))).toBe(
      true,
    );
  });

  it("records N1 basis correction, survives reload, preserves originals", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();
    const cmd = {
      type: "record_adjustment" as const,
      workspaceId,
      branchId: "main",
      claimKey: "F8949.B.N1",
      engineVersion: "v3",
      field: "basis" as const,
      effectiveValue: 19100,
      category: "basis_correction" as const,
      effectMethod: "stcg" as const,
      evidenceRefs: ["ev-0066", "D11"],
      reason: "Apply D11 supplemental basis",
      expectedRevision: 0,
      idempotencyKey: key("adj"),
      expectedBranchSequence: 0,
    };

    const first = await executeCommand({
      command: cmd,
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const sk = scopeKey("v3", "F8949.B.N1");
    const adj = first.projection.adjustments[sk];
    expect(adj.originalValue).toBe(0);
    expect(adj.effectiveValue).toBe(19100);
    expect(adj.workingGain).toBe(140);
    expect(adj.reversed).toBe(false);
    expect(adj.evidenceRefs).toEqual(["ev-0066", "D11"]);
    expect(first.events[0].actorId).toBe("st-01");
    expect(first.events[0].sequence).toBe(1);

    // Reload from store (simulates restart)
    const reloaded = await loadProjection(workspaceId, "main", s);
    expect(reloaded.adjustments[sk]?.workingGain).toBe(140);
    expect(reloaded.sequence).toBe(1);

    const claim = projectClaim(
      "F8949.B.N1",
      "v3",
      undefined,
      reloaded,
    )!;
    expect(claim.engineValueDisplay).toMatch(/19,240/);
    expect(claim.working?.originalBasisDisplay).toMatch(/0/);
    expect(claim.working?.supportedBasisDisplay).toMatch(/19,100/);
    expect(claim.working?.workingGainDisplay).toMatch(/140/);
    expect(claim.working?.fullyRecomputed).toBe(false);
  });

  it("rejects stale writes and deduplicates retried commands", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();
    const idem = key("adj");
    const base = {
      type: "record_adjustment" as const,
      workspaceId,
      branchId: "main",
      claimKey: "F8949.B.N1",
      engineVersion: "v3",
      field: "basis" as const,
      effectiveValue: 19100,
      category: "basis_correction" as const,
      effectMethod: "stcg" as const,
      evidenceRefs: ["ev-0066"],
      reason: "Apply D11 supplemental basis",
      expectedRevision: 0,
      idempotencyKey: idem,
      expectedBranchSequence: 0,
    };

    const a = await executeCommand({
      command: base,
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(a.ok).toBe(true);

    const retry = await executeCommand({
      command: base,
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.deduped).toBe(true);
      expect(retry.projection.sequence).toBe(1);
    }

    const stale = await executeCommand({
      command: {
        ...base,
        idempotencyKey: key("adj2"),
        expectedRevision: 0,
        expectedBranchSequence: 0,
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe("stale");
    }
  });

  it("isolates workspaces server-side", async () => {
    loadPacket();
    const s = store();
    const wsA = ws();
    const wsB = ws();

    const isolation = assertWorkspaceAccess(wsA, wsB);
    expect(isolation?.ok).toBe(false);
    expect(isolation && !isolation.ok && isolation.code).toBe("isolation");

    await executeCommand({
      command: {
        type: "record_note",
        workspaceId: wsA,
        branchId: "main",
        text: "Only in A",
        visibility: "internal",
        blocking: false,
        idempotencyKey: key("note"),
        expectedBranchSequence: 0,
      },
      actorId: "st-01",
      sessionWorkspaceId: wsA,
      store: s,
    });

    const projA = await loadProjection(wsA, "main", s);
    const projB = await loadProjection(wsB, "main", s);
    expect(projA.notes).toHaveLength(1);
    expect(projB.notes).toHaveLength(0);
    expect(projA.sequence).toBe(1);
    expect(projB.sequence).toBe(0);

    const cross = await executeCommand({
      command: {
        type: "record_note",
        workspaceId: wsB,
        branchId: "main",
        text: "Cross attempt",
        visibility: "internal",
        blocking: false,
        idempotencyKey: key("note"),
      },
      actorId: "st-01",
      sessionWorkspaceId: wsA,
      store: s,
    });
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe("isolation");
  });

  it("reopens sign-offs after material adjustment; notes do not", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();

    const sign = await executeCommand({
      command: {
        type: "record_signoff",
        workspaceId,
        branchId: "main",
        claimKey: "F8949.B.N1",
        engineVersion: "v3",
        level: "reviewer",
        expectedRevision: 0,
        idempotencyKey: key("sig"),
        expectedBranchSequence: 0,
      },
      actorId: "st-02",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(sign.ok).toBe(true);

    const note = await executeCommand({
      command: {
        type: "record_note",
        workspaceId,
        branchId: "main",
        claimKey: "F8949.B.N1",
        text: "Unrelated observation — should not reopen",
        visibility: "internal",
        blocking: false,
        idempotencyKey: key("note"),
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(note.ok).toBe(true);
    if (note.ok) {
      const sk = scopeKey("v3", "F8949.B.N1");
      expect(note.projection.signoffs[sk]?.status).toBe("active");
    }

    const adj = await executeCommand({
      command: {
        type: "record_adjustment",
        workspaceId,
        branchId: "main",
        claimKey: "F8949.B.N1",
        engineVersion: "v3",
        field: "basis",
        effectiveValue: 19100,
        category: "basis_correction",
        effectMethod: "stcg",
        evidenceRefs: ["ev-0066"],
        reason: "Material basis change",
        expectedRevision: 1,
        idempotencyKey: key("adj"),
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(adj.ok).toBe(true);
    if (adj.ok) {
      const sk = scopeKey("v3", "F8949.B.N1");
      expect(adj.projection.signoffs[sk]?.status).toBe("reopened");
      expect(adj.projection.signoffs[sk]?.reopenReason).toMatch(/Material/);
    }
  });

  it("undo restores working values via compensating event without deleting history", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();

    const adj = await executeCommand({
      command: {
        type: "record_adjustment",
        workspaceId,
        branchId: "main",
        claimKey: "F8949.B.N1",
        engineVersion: "v3",
        field: "basis",
        effectiveValue: 19100,
        category: "basis_correction",
        effectMethod: "stcg",
        evidenceRefs: ["ev-0066"],
        reason: "Apply D11",
        expectedRevision: 0,
        idempotencyKey: key("adj"),
        expectedBranchSequence: 0,
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(adj.ok).toBe(true);
    if (!adj.ok) return;
    const eventId = adj.events[0].id;

    const undo = await executeCommand({
      command: {
        type: "undo_event",
        workspaceId,
        branchId: "main",
        eventId,
        reason: "Restore engine gain",
        idempotencyKey: key("undo"),
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;

    const sk = scopeKey("v3", "F8949.B.N1");
    expect(undo.projection.adjustments[sk]?.reversed).toBe(true);
    expect(undo.projection.reversedEventIds).toContain(eventId);
    expect(undo.projection.sequence).toBe(2);

    const history = await s.listEvents(workspaceId, "main");
    expect(history).toHaveLength(2);
    expect(history[0].type).toBe("adjustment_recorded");
    expect(history[1].type).toBe("event_reversed");

    const claim = projectClaim("F8949.B.N1", "v3", undefined, undo.projection)!;
    expect(claim.working?.workingGainDisplay).toBeNull();
    expect(claim.working?.workingValueDisplay).toBe(claim.engineValueDisplay);
  });

  it("bulk assign commits atomically and bulk undo reverses the batch", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();
    const scopes = [
      scopeKey("v3", "F8949.B.N1"),
      scopeKey("v3", "F8949.B.N3"),
    ];

    const assign = await executeCommand({
      command: {
        type: "bulk_assign",
        workspaceId,
        branchId: "main",
        assigneeId: "st-02",
        scopeKeys: scopes,
        area: "capital_gains",
        reason: "Queue RSU lots for review",
        idempotencyKey: key("bulk"),
        expectedBranchSequence: 0,
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(assign.ok).toBe(true);
    if (!assign.ok) return;
    expect(assign.events).toHaveLength(2);
    expect(assign.events[0].batchId).toBeTruthy();
    expect(assign.events[0].batchId).toBe(assign.events[1].batchId);
    expect(assign.projection.sequence).toBe(2);
    expect(assign.projection.assignments[scopes[0]]?.assigneeId).toBe("st-02");
    expect(assign.projection.assignments[scopes[1]]?.assigneeId).toBe("st-02");

    const batchId = assign.events[0].batchId!;
    const undo = await executeCommand({
      command: {
        type: "bulk_undo",
        workspaceId,
        branchId: "main",
        batchId,
        reason: "Atomic bulk undo",
        idempotencyKey: key("bulkundo"),
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    expect(undo.events).toHaveLength(2);
    expect(undo.projection.sequence).toBe(4);
    expect(undo.projection.assignments[scopes[0]]?.reversed).toBe(true);
    expect(undo.projection.assignments[scopes[1]]?.reversed).toBe(true);

    const history = await s.listEvents(workspaceId, "main");
    expect(history).toHaveLength(4);
  });

  it("persists document disposition overrides through events", async () => {
    loadPacket();
    const s = store();
    const workspaceId = ws();
    const result = await executeCommand({
      command: {
        type: "record_disposition",
        workspaceId,
        branchId: "main",
        documentId: "D11",
        disposition: "supporting_only",
        explanation: "Supplemental basis support for RSU lots",
        idempotencyKey: key("disp"),
        expectedBranchSequence: 0,
      },
      actorId: "st-01",
      sessionWorkspaceId: workspaceId,
      store: s,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.dispositions.D11?.disposition).toBe(
      "supporting_only",
    );
    expect(result.projection.dispositions.D11?.reversed).toBe(false);
  });

  it("reducer is deterministic and fingerprints ignore notes", () => {
    loadPacket();
    const workspaceId = ws();
    const empty = emptyProjection(workspaceId);
    const fp1 = claimFingerprint("F8949.B.N1", "v3", empty);
    empty.notes.push({
      noteId: "n1",
      claimKey: "F8949.B.N1",
      text: "view note",
      visibility: "internal",
      blocking: false,
      actorId: "st-01",
      eventId: "e1",
      sequence: 1,
      resolved: false,
    });
    const fp2 = claimFingerprint("F8949.B.N1", "v3", empty);
    expect(fp1).toBe(fp2);

    // Fold empty list is identity
    expect(reduceEvents(workspaceId, "main", []).sequence).toBe(0);
  });
});
