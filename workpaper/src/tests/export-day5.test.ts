import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "@/lib/events/service";
import { executeFilingCommand } from "@/lib/filing/service";
import { loadSnapshotExport, renderSnapshotExport } from "@/lib/filing/export";
import { MemoryEventStore } from "@/lib/persistence/memory-store";
import type { WorkspaceSession } from "@/lib/workspace/session";

async function fixture() {
  const store = new MemoryEventStore();
  const workspaceId = `ws_${randomUUID()}`;
  const session: WorkspaceSession = { workspaceId, branchId: "main", personaId: "st-01", version: "v3", simulationDate: "2026-06-23", isNew: false, locked: false };
  const note = await executeCommand({ store, actorId: "st-01", sessionWorkspaceId: workspaceId, command: {
    type: "record_note", workspaceId, branchId: "main", text: "<script>alert('test')</script> SSN 123-45-6789", visibility: "internal", blocking: false, idempotencyKey: randomUUID(),
  } });
  if (!note.ok) throw new Error(note.message);
  const result = await executeFilingCommand({ store, actorId: "st-01", sessionWorkspaceId: workspaceId, command: {
    type: "freeze_package", workspaceId, branchId: "main", scope: "full_return", expectedSequence: 1, idempotencyKey: randomUUID(),
  } });
  if (!result.ok) throw new Error(result.message);
  return { store, session, snapshotId: result.state.snapshots[0].id };
}

describe("Offline frozen exports", () => {
  it("renders self-contained evidence with resolving local links and escaped untrusted content", async () => {
    const s = await fixture();
    const dto = await loadSnapshotExport({ ...s, kind: "notice" });
    const html = renderSnapshotExport(dto);
    const anchors = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const links = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    expect(links.length).toBeGreaterThan(15);
    for (const target of links) expect(anchors.has(target), target).toBe(true);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script\b|\bsrc=|href="https?:/i);
    expect(dto.evidence.some(item => item.ref === "SchA.12")).toBe(true);
    expect(dto.evidence.some(item => item.ref === "SchC.1")).toBe(true);
    expect(dto.evidence.some(item => item.ref.includes("D71") || item.ref.includes("D72"))).toBe(false);
  });

  it("keeps the original export unchanged after later workspace decisions", async () => {
    const s = await fixture();
    const before = renderSnapshotExport(await loadSnapshotExport({ ...s, kind: "notice" }));
    await executeCommand({ store: s.store, actorId: "st-01", sessionWorkspaceId: s.session.workspaceId, command: {
      type: "record_note", workspaceId: s.session.workspaceId, branchId: "main", text: "Later note outside snapshot", visibility: "internal", blocking: false, idempotencyKey: randomUUID(),
    } });
    const after = renderSnapshotExport(await loadSnapshotExport({ ...s, kind: "notice" }));
    expect(after).toBe(before);
    expect(after).not.toContain("Later note outside snapshot");
  });

  it("restricts clients to summaries, denies admin, and masks uncleared staff payloads", async () => {
    const s = await fixture();
    const client = { ...s, session: { ...s.session, personaId: "cu-01" } };
    await expect(loadSnapshotExport({ ...client, kind: "notice" })).rejects.toMatchObject({ status: 403 });
    const summary = await loadSnapshotExport({ ...client, kind: "client" });
    expect(summary.manifest).toBeUndefined();
    expect(summary.evidence).toEqual([]);
    expect(summary.decisions).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain("123-45-6789");
    await expect(loadSnapshotExport({ ...s, session: { ...s.session, personaId: "st-05" }, kind: "client" })).rejects.toMatchObject({ status: 403 });
    const masked = await loadSnapshotExport({ ...s, session: { ...s.session, personaId: "st-04" }, kind: "notice" });
    expect(JSON.stringify(masked)).not.toContain("123-45-6789");
    expect(JSON.stringify(masked)).toContain("[restricted]");
  });

  it("refuses cross-workspace, unknown branch, and corrupted snapshot exports", async () => {
    const s = await fixture();
    const other = `ws_${randomUUID()}`;
    await s.store.ensureWorkspace(other);
    await expect(loadSnapshotExport({ ...s, session: { ...s.session, workspaceId: other }, kind: "notice" })).rejects.toMatchObject({ status: 404 });
    await expect(loadSnapshotExport({ ...s, branchId: "unknown", kind: "notice" })).rejects.toMatchObject({ status: 404 });
    const original = s.store.listEvents.bind(s.store);
    vi.spyOn(s.store, "listEvents").mockImplementation(async (...args) => (await original(...args)).map(event => {
      if (event.payload.kind === "snapshot_created") event.payload.snapshot.summary.n1.engineGain = 1;
      return event;
    }));
    await expect(loadSnapshotExport({ ...s, kind: "notice" })).rejects.toMatchObject({ status: 409 });
  });
});
