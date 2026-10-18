import type { StoredEvent } from "@/lib/events/types";

export type WorkspaceRecord = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  firmLabel: string;
};

export type AppendEventsInput = {
  workspaceId: string;
  branchId: string;
  events: Omit<StoredEvent, "sequence">[];
  /**
   * When set, the first new event must be at expectedSequence + 1
   * relative to the store's current max sequence for the branch.
   * Used for optimistic concurrency on the workspace stream.
   */
  expectedBranchSequence?: number;
};

export type AppendEventsResult =
  | { ok: true; events: StoredEvent[]; deduped: boolean }
  | {
      ok: false;
      code: "stale" | "conflict" | "isolation" | "validation";
      message: string;
      currentSequence?: number;
    };

export type BranchRecord = {
  id: string; label: string; createdAt: string;
  parentBranchId?: string; parentSnapshotId?: string;
  mode?: "amendment" | "successor";
};
export type CreateBranchInput = {
  workspaceId: string; branch: BranchRecord; baseEvents: StoredEvent[];
  creationEvent: Omit<StoredEvent, "sequence">;
};
export interface EventStore {
  getBranch(workspaceId: string, branchId: string): Promise<BranchRecord | null>;
  listBranches(workspaceId: string): Promise<BranchRecord[]>;
  createBranch(input: CreateBranchInput): Promise<AppendEventsResult>;
  ensureWorkspace(workspaceId: string): Promise<WorkspaceRecord>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  listEvents(
    workspaceId: string,
    branchId: string,
  ): Promise<StoredEvent[]>;
  /**
   * Append one or more events atomically.
   * Idempotency: if the first event's idempotencyKey exists, return the
   * previously stored batch without appending.
   */
  appendEvents(input: AppendEventsInput): Promise<AppendEventsResult>;
  /** Test helper — wipe a workspace. */
  deleteWorkspace?(workspaceId: string): Promise<void>;
}
