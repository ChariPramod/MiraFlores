import { branchValidation, inheritedEvents, frozenDenial } from "./branch-utils";
import { randomUUID } from "node:crypto";
import { StoredEventSchema, type StoredEvent } from "@/lib/events/types";
import type {
  AppendEventsInput,
  AppendEventsResult,
  EventStore,
  WorkspaceRecord,
  BranchRecord, CreateBranchInput,
} from "./store";

/**
 * In-memory event store for unit tests. Same concurrency / idempotency rules
 * as the file and Supabase stores.
 */
export class MemoryEventStore implements EventStore {
  private workspaces = new Map<string, WorkspaceRecord>();
  private branches = new Map<string, Map<string, BranchRecord & { baseEvents?: StoredEvent[] }>>();
  private events = new Map<string, StoredEvent[]>();

  async ensureWorkspace(workspaceId: string): Promise<WorkspaceRecord> {
    if (!workspaceId.startsWith("ws_")) {
      throw new Error("Invalid workspace id");
    }
    const existing = this.workspaces.get(workspaceId);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      return existing;
    }
    const now = new Date().toISOString();
    const rec: WorkspaceRecord = {
      id: workspaceId,
      createdAt: now,
      lastSeenAt: now,
      firmLabel: "Miraflores demo",
    };
    this.workspaces.set(workspaceId, rec);
    this.branches.set(workspaceId, new Map([["main", { id:"main", label:"main", createdAt:now }]]));
    this.events.set(workspaceId, []);
    return rec;
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.workspaces.get(workspaceId) ?? null;
  }

  async listEvents(
    workspaceId: string,
    branchId: string,
  ): Promise<StoredEvent[]> {
    const base = this.branches.get(workspaceId)?.get(branchId)?.baseEvents ?? [];
    return structuredClone([...inheritedEvents(base, branchId), ...(this.events.get(workspaceId) ?? []).filter(e => e.branchId === branchId)]).sort((a,b) => a.sequence-b.sequence);
  }

  async appendEvents(input: AppendEventsInput): Promise<AppendEventsResult> {
    if (!this.workspaces.has(input.workspaceId)) {
      return {
        ok: false,
        code: "isolation",
        message: "Workspace not found",
      };
    }
    const branchSet = this.branches.get(input.workspaceId)!;
    if (!branchSet.has(input.branchId)) {
      return {
        ok: false,
        code: "validation",
        message: `Unknown branch ${input.branchId}`,
      };
    }

    const all = this.events.get(input.workspaceId)!;
    const firstKey = input.events[0]?.idempotencyKey;
    if (firstKey) {
      const prior = all.filter((e) => e.idempotencyKey === firstKey);
      if (prior.length) {
        if (prior[0].branchId !== input.branchId || prior[0].actorId !== input.events[0].actorId) return { ok:false, code:"conflict", message:"Idempotency key belongs to another scope" };
        const batchId = prior[0].batchId;
        const batch = batchId
          ? all.filter((e) => e.batchId === batchId)
          : prior;
        return { ok: true, events: batch, deduped: true };
      }
    }

    const branchEvents = [...inheritedEvents(branchSet.get(input.branchId)?.baseEvents ?? [], input.branchId), ...all.filter((e) => e.branchId === input.branchId)];
    const frozen = frozenDenial(branchEvents, input);
    if (frozen) return frozen;
    const currentSequence =
      branchEvents.reduce((max, e) => Math.max(max, e.sequence), 0) || 0;

    if (
      input.expectedBranchSequence !== undefined &&
      input.expectedBranchSequence !== currentSequence
    ) {
      return {
        ok: false,
        code: "stale",
        message: `Stale write: expected sequence ${input.expectedBranchSequence}, current ${currentSequence}`,
        currentSequence,
      };
    }

    const batchId =
      input.events.length > 1
        ? input.events[0].batchId ?? `batch_${randomUUID()}`
        : input.events[0]?.batchId;

    const appended: StoredEvent[] = [];
    let seq = currentSequence;
    for (const partial of input.events) {
      if (partial.workspaceId !== input.workspaceId || partial.branchId !== input.branchId) {
        return {
          ok: false,
          code: "isolation",
          message: "Event workspaceId does not match append target",
        };
      }
      seq += 1;
      const event = StoredEventSchema.parse({
        ...partial,
        sequence: seq,
        batchId: batchId ?? partial.batchId,
      });
      appended.push(event);
    }

    all.push(...structuredClone(appended));
    const ws = this.workspaces.get(input.workspaceId)!;
    ws.lastSeenAt = new Date().toISOString();
    return { ok: true, events: appended, deduped: false };
  }

  async getBranch(workspaceId: string, branchId: string): Promise<BranchRecord | null> {
    const branch = this.branches.get(workspaceId)?.get(branchId);
    if (!branch) return null;
    const { baseEvents: _base, ...record } = branch;
    return structuredClone(record);
  }
  async listBranches(workspaceId: string): Promise<BranchRecord[]> {
    return [...(this.branches.get(workspaceId)?.values() ?? [])].map(({ baseEvents: _base, ...record }) => structuredClone(record));
  }
  async createBranch(input: CreateBranchInput): Promise<AppendEventsResult> {
    const branches = this.branches.get(input.workspaceId);
    if (!branches) return { ok:false,code:"isolation",message:"Workspace not found" };
    const events = this.events.get(input.workspaceId)!;
    const hit = events.find(e => e.idempotencyKey === input.creationEvent.idempotencyKey);
    if (hit) return hit.actorId === input.creationEvent.actorId ? { ok:true,events:[hit],deduped:true } : { ok:false,code:"conflict",message:"Idempotency key belongs to another actor" };
    if (branches.has(input.branch.id)) return { ok:false,code:"conflict",message:"Branch already exists" };
    const invalid = branchValidation(input, await this.listEvents(input.workspaceId, input.branch.parentBranchId ?? ''));
    if (invalid) return { ok:false,code:"validation",message:invalid };
    const event = StoredEventSchema.parse({ ...input.creationEvent, sequence:input.baseEvents.length+1 });
    branches.set(input.branch.id, structuredClone({ ...input.branch, baseEvents:input.baseEvents }));
    events.push(structuredClone(event));
    return { ok:true,events:[event],deduped:false };
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    this.workspaces.delete(workspaceId);
    this.branches.delete(workspaceId);
    this.events.delete(workspaceId);
  }
}
