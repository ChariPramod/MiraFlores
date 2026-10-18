import "server-only";
import { branchValidation, inheritedEvents, frozenDenial } from "./branch-utils";
import { validWorkspaceId } from "@/lib/security/tokens";

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StoredEventSchema, type StoredEvent } from "@/lib/events/types";
import type {
  AppendEventsInput,
  AppendEventsResult,
  EventStore,
  WorkspaceRecord,
  BranchRecord, CreateBranchInput,
} from "./store";

type FileDb = {
  workspace: WorkspaceRecord;
  branches: Array<BranchRecord & { baseEvents?: StoredEvent[] }>;
  events: StoredEvent[];
};

function rootDir(): string {
  return path.join(process.cwd(), ".data", "workspaces");
}

function workspacePath(workspaceId: string): string {
  if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace id");
  return path.join(rootDir(), `${workspaceId}.json`);
}

function readDb(workspaceId: string): FileDb | null {
  const file = workspacePath(workspaceId);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as FileDb;
  raw.events = raw.events.map((e) => StoredEventSchema.parse(e));
  return raw;
}

function writeDb(db: FileDb): void {
  mkdirSync(rootDir(), { recursive: true });
  const file = workspacePath(db.workspace.id);
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  renameSync(tmp, file);
}

export class FileEventStore implements EventStore {
  async ensureWorkspace(workspaceId: string): Promise<WorkspaceRecord> {
    if (!validWorkspaceId(workspaceId)) {
      throw new Error("Invalid workspace id");
    }
    const existing = readDb(workspaceId);
    if (existing) {

      return existing.workspace;
    }
    mkdirSync(rootDir(), { recursive: true });
    const lock = workspacePath(workspaceId) + ".lock";
    mkdirSync(lock);
    try {
    const raced = readDb(workspaceId);
    if (raced) return raced.workspace;
    const now = new Date().toISOString();
    const db: FileDb = {
      workspace: {
        id: workspaceId,
        createdAt: now,
        lastSeenAt: now,
        firmLabel: "Miraflores demo",
      },
      branches: [{ id: "main", label: "main", createdAt: now }],
      events: [],
    };
    writeDb(db);
    return db.workspace;
    } finally { rmSync(lock, { recursive: true }); }
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return readDb(workspaceId)?.workspace ?? null;
  }

  async listEvents(
    workspaceId: string,
    branchId: string,
  ): Promise<StoredEvent[]> {
    const db = readDb(workspaceId);
    if (!db) return [];
    const branch = db.branches.find(b => b.id === branchId);
    return [...inheritedEvents(branch?.baseEvents ?? [], branchId), ...db.events.filter(e => e.branchId === branchId)].sort((a,b) => a.sequence-b.sequence);
  }

  async appendEvents(input: AppendEventsInput): Promise<AppendEventsResult> {
    mkdirSync(rootDir(), { recursive: true });
    const lock = workspacePath(input.workspaceId) + ".lock";
    try { mkdirSync(lock); } catch { return { ok: false, code: "conflict", message: "Workspace is busy; retry the command with the same idempotency key" }; }
    try {
    const db = readDb(input.workspaceId);
    if (!db) {
      return {
        ok: false,
        code: "isolation",
        message: "Workspace not found",
      };
    }
    if (!db.branches.some((b) => b.id === input.branchId)) {
      return {
        ok: false,
        code: "validation",
        message: `Unknown branch ${input.branchId}`,
      };
    }

    const firstKey = input.events[0]?.idempotencyKey;
    if (firstKey) {
      const prior = db.events.filter((e) => e.idempotencyKey === firstKey);
      if (prior.length) {
        if (prior[0].branchId !== input.branchId || prior[0].actorId !== input.events[0].actorId) return { ok:false, code:"conflict", message:"Idempotency key belongs to another scope" };
        const batchId = prior[0].batchId;
        const batch = batchId
          ? db.events.filter((e) => e.batchId === batchId)
          : prior;
        return { ok: true, events: batch, deduped: true };
      }
    }

    const branchEvents = [...inheritedEvents(db.branches.find(b => b.id === input.branchId)?.baseEvents ?? [], input.branchId), ...db.events.filter((e) => e.branchId === input.branchId)];
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
      db.events.push(event);
      appended.push(event);
    }

    db.workspace.lastSeenAt = new Date().toISOString();
    writeDb(db);
    return { ok: true, events: appended, deduped: false };
    } finally { rmSync(lock, { recursive: true }); }
  }

  async getBranch(workspaceId: string, branchId: string): Promise<BranchRecord | null> {
    const branch = readDb(workspaceId)?.branches.find(b => b.id === branchId);
    if (!branch) return null;
    const { baseEvents: _base, ...record } = branch;
    return record;
  }
  async listBranches(workspaceId: string): Promise<BranchRecord[]> {
    return (readDb(workspaceId)?.branches ?? []).map(({ baseEvents: _base, ...record }) => record);
  }
  async createBranch(input: CreateBranchInput): Promise<AppendEventsResult> {
    const lock = workspacePath(input.workspaceId) + ".lock";
    try { mkdirSync(lock); } catch { return { ok:false, code:"conflict", message:"Workspace is busy; retry the command" }; }
    try {
      const db = readDb(input.workspaceId);
      if (!db) return { ok:false, code:"isolation", message:"Workspace not found" };
      const hit = db.events.find(e => e.idempotencyKey === input.creationEvent.idempotencyKey);
      if (hit) return hit.actorId === input.creationEvent.actorId ? { ok:true, events:[hit], deduped:true } : { ok:false,code:"conflict",message:"Idempotency key belongs to another actor" };
      if (db.branches.some(b => b.id === input.branch.id)) return { ok:false,code:"conflict",message:"Branch already exists" };
      const parent = db.branches.find(b => b.id === input.branch.parentBranchId);
      const history = [...inheritedEvents(parent?.baseEvents ?? [], parent?.id ?? ''), ...db.events.filter(e => e.branchId === parent?.id)];
      const invalid = branchValidation(input, history);
      if (invalid) return { ok:false,code:"validation",message:invalid };
      const event = StoredEventSchema.parse({ ...input.creationEvent, sequence:input.baseEvents.length+1 });
      db.branches.push({ ...input.branch, baseEvents:input.baseEvents });
      db.events.push(event);
      writeDb(db);
      return { ok:true,events:[event],deduped:false };
    } finally { rmSync(lock, { recursive:true }); }
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const file = workspacePath(workspaceId);
    if (existsSync(file)) rmSync(file);
  }
}
