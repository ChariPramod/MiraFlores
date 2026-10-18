import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Command } from "@/lib/events/commands";
import { executeCommand } from "@/lib/events/service";
import { MemoryEventStore } from "@/lib/persistence/memory-store";
import { collaborationView } from "@/lib/workspace/collaboration";

function harness() {
  const workspaceId = `ws_${randomUUID()}`;
  const store = new MemoryEventStore();
  const base = () => ({ workspaceId, branchId: "main", idempotencyKey: randomUUID() });
  async function send(command: Command) {
    const result = await executeCommand({ command, actorId: "st-01", sessionWorkspaceId: workspaceId, store });
    if (!result.ok) throw new Error(result.message);
    return result;
  }
  const assign = (assigneeId: string) => send({ ...base(), type: "bulk_assign", assigneeId, scopeKeys: ["v3::F8949.B.N1", "v3::F1040.7"], reason: "Assign the capital gains review" });
  const view = async (actorId: string) => collaborationView(await store.listEvents(workspaceId, "main"), actorId);
  return { base, send, assign, view };
}

describe("Current assignment notifications", () => {
  it("removes the previous assignee's notices after reassignment", async () => {
    const h = harness();
    await h.assign("st-02");
    expect((await h.view("st-02")).assignments).toHaveLength(2);
    await h.assign("st-03");
    expect((await h.view("st-02")).assignments).toEqual([]);
    expect((await h.view("st-02")).notices).toEqual([]);
    expect((await h.view("st-03")).notices).toHaveLength(2);
    expect((await h.view("cu-01")).notices).toEqual([]);
  });

  it("restores exactly the previous assignee's notices when reassignment is undone", async () => {
    const h = harness();
    const first = await h.assign("st-02");
    const second = await h.assign("st-03");
    await h.send({ ...h.base(), type: "bulk_undo", batchId: second.events[0].batchId!, reason: "Restore original reviewer" });
    expect((await h.view("st-03")).notices).toEqual([]);
    const restored = await h.view("st-02");
    expect(restored.assignments.map(item => item.id)).toEqual(first.events.map(event => event.id));
    expect(restored.notices).toHaveLength(2);
  });

  it("does not resurrect notifications from an assignment withdrawn before its replacement", async () => {
    const h = harness();
    const first = await h.assign("st-02");
    const second = await h.assign("st-03");
    await h.send({ ...h.base(), type: "bulk_undo", batchId: first.events[0].batchId!, reason: "Withdraw earlier assignment" });
    expect((await h.view("st-03")).notices).toHaveLength(2);
    await h.send({ ...h.base(), type: "bulk_undo", batchId: second.events[0].batchId!, reason: "Withdraw current assignment" });
    expect((await h.view("st-02")).notices).toEqual([]);
    expect((await h.view("st-03")).notices).toEqual([]);
    expect(collaborationView([], "st-02").notices).toEqual([]);
  });
});
