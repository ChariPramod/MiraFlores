import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Command } from "@/lib/events/commands";
import { claimFingerprint, scopeKey, verificationFingerprint } from "@/lib/events/fingerprint";
import { executeCommand } from "@/lib/events/service";
import { MemoryEventStore } from "@/lib/persistence/memory-store";

const claimKey = "F8949.B.N1";
const engineVersion = "v3";
const sk = scopeKey(engineVersion, claimKey);

function scenario() {
  const workspaceId = `ws_${randomUUID()}`;
  const store = new MemoryEventStore();
  const base = () => ({ workspaceId, branchId: "main", idempotencyKey: randomUUID() });
  async function run(command: Command, actorId = "st-01") {
    const result = await executeCommand({ command, actorId, sessionWorkspaceId: workspaceId, store });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result;
  }
  const adjust = (effectiveValue: number, expectedRevision: number, evidenceRefs = ["ev-0066"]) => run({
    ...base(), type: "record_adjustment", claimKey, engineVersion, field: "basis", effectiveValue,
    category: "basis_correction", effectMethod: "stcg", reason: "Use cited supplemental basis", evidenceRefs, expectedRevision,
  });
  const undo = (eventId: string) => run({ ...base(), type: "undo_event", eventId, reason: "Withdraw this decision" });
  return { base, run, adjust, undo, store, workspaceId };
}

describe("Compensating undo preserves prior decisions", () => {
  it("restores the previous basis after a second correction is undone, keeping revisions monotonic", async () => {
    const s = scenario();
    const first = await s.adjust(19100, 0);
    const second = await s.adjust(19000, 1);
    const restored = await s.undo(second.events[0].id);
    expect(restored.projection.adjustments[sk]).toMatchObject({ effectiveValue: 19100, workingGain: 140, reversed: false, eventId: first.events[0].id });
    expect(restored.projection.claimRevisions[claimKey]).toBe(3);
    expect(restored.projection.sequence).toBe(3);
    expect(await s.store.listEvents(s.workspaceId, "main")).toHaveLength(3);
  });

  it("does not resurrect an earlier decision that was already reversed", async () => {
    const s = scenario();
    const first = await s.adjust(19100, 0);
    const second = await s.adjust(19000, 1);
    const olderUndone = await s.undo(first.events[0].id);
    expect(olderUndone.projection.adjustments[sk]).toMatchObject({ effectiveValue: 19000, reversed: false });
    const bothUndone = await s.undo(second.events[0].id);
    expect(bothUndone.projection.adjustments[sk].reversed).toBe(true);
    expect(bothUndone.projection.reversedEventIds).toEqual([first.events[0].id, second.events[0].id]);
  });

  it("restores previous dispositions and bulk assignments instead of clearing them", async () => {
    const s = scenario();
    const assign = (assigneeId: string) => s.run({ ...s.base(), type: "bulk_assign", assigneeId, scopeKeys: [sk, "v3::F1040.7"], reason: "Assign capital gains review" });
    const first = await assign("st-02");
    const second = await assign("st-03");
    const undone = await s.run({ ...s.base(), type: "bulk_undo", batchId: second.events[0].batchId!, reason: "Restore prior review assignment" });
    expect(undone.projection.assignments[sk]).toMatchObject({ assigneeId: "st-02", eventId: first.events[0].id, reversed: false });
    expect(undone.projection.assignments["v3::F1040.7"]).toMatchObject({ assigneeId: "st-02", reversed: false });
    const disposition = (value: "supporting_only" | "pending") => s.run({ ...s.base(), type: "record_disposition", documentId: "D11", disposition: value, explanation: "Review supplemental basis support" });
    const original = await disposition("supporting_only");
    const newer = await disposition("pending");
    const restored = await s.undo(newer.events[0].id);
    expect(restored.projection.dispositions.D11).toMatchObject({ disposition: "supporting_only", eventId: original.events[0].id, reversed: false });
    expect(restored.projection.documentRevisions.D11).toBe(3);
  });

  it("withdrawal of a verification reopens both its claim and dependent approval", async () => {
    const s = scenario();
    const verified = await s.run({ ...s.base(), type: "record_verification", claimKey, engineVersion, method: "agree_to_supplemental", conclusion: "verified", evidenceRefs: ["ev-0066"], expectedRevision: 0 });
    expect(verified.projection.verifications[sk].checkedFingerprint).toBe(verificationFingerprint(claimKey, engineVersion, verified.projection));
    await s.run({ ...s.base(), type: "record_signoff", claimKey, engineVersion, level: "reviewer", expectedRevision: 1 }, "st-02");
    const approved = await s.run({ ...s.base(), type: "record_signoff", claimKey: "F1040.7", engineVersion, level: "reviewer", expectedRevision: 0 }, "st-02");
    const oldFingerprint = claimFingerprint(claimKey, engineVersion, approved.projection);
    const withdrawn = await s.undo(verified.events[0].id);
    expect(withdrawn.projection.verifications[sk].open).toBe(false);
    expect(withdrawn.projection.signoffs[sk].status).toBe("reopened");
    expect(withdrawn.projection.signoffs["v3::F1040.7"].status).toBe("reopened");
    expect(withdrawn.projection.claimRevisions[claimKey]).toBe(3);
    expect(claimFingerprint(claimKey, engineVersion, withdrawn.projection)).not.toBe(oldFingerprint);
  });

  it("document-page citations invalidate approval and verification when disposition changes", async () => {
    const s = scenario();
    await s.adjust(19100, 0, ["doc:D11#page2"]);
    await s.run({ ...s.base(), type: "record_verification", claimKey, engineVersion, method: "agree_to_supplemental", conclusion: "verified", evidenceRefs: ["doc:D11#page2"], expectedRevision: 1 });
    await s.run({ ...s.base(), type: "record_signoff", claimKey, engineVersion, level: "reviewer", expectedRevision: 2 }, "st-02");
    const changed = await s.run({ ...s.base(), type: "record_disposition", documentId: "D11", disposition: "pending", explanation: "Supporting statement requires renewed review" });
    expect(changed.projection.signoffs[sk].status).toBe("reopened");
    expect(changed.projection.verifications[sk].open).toBe(false);
  });

  it("undoing note resolution restores its filing blocker without erasing the resolution event", async () => {
    const s = scenario();
    const created = await s.run({ ...s.base(), type: "record_note", claimKey, text: "Confirm supporting basis", visibility: "internal", blocking: true });
    const noteId = created.projection.notes[0].noteId;
    const resolved = await s.run({ ...s.base(), type: "resolve_note", noteId, resolution: "Supporting statement checked" });
    const undone = await s.undo(resolved.events[0].id);
    expect(undone.projection.notes[0]).toMatchObject({ noteId, blocking: true, resolved: false });
    expect(await s.store.listEvents(s.workspaceId, "main")).toHaveLength(3);
  });
});
