import "server-only";
import { branchValidation, inheritedEvents } from "./branch-utils";
import { validWorkspaceId } from "@/lib/security/tokens";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StoredEventSchema, type StoredEvent } from "@/lib/events/types";
import type {
  AppendEventsInput,
  AppendEventsResult,
  EventStore,
  WorkspaceRecord,
  BranchRecord, CreateBranchInput,
} from "./store";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function adminKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createSupabaseAdmin(): SupabaseClient {
  const key = adminKey();
  if (!key) throw new Error("Missing env SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(
    requireEnv("SUPABASE_URL"),
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && adminKey(),
  );
}

export class SupabaseEventStore implements EventStore {
  constructor(private readonly client: SupabaseClient = createSupabaseAdmin()) {}

  async ensureWorkspace(workspaceId: string): Promise<WorkspaceRecord> {
    if (!validWorkspaceId(workspaceId)) {
      throw new Error("Invalid workspace id");
    }
    const now = new Date().toISOString();
    const { error } = await this.client.from("workspaces").upsert({ id: workspaceId, firm_label: "Miraflores demo" }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
    const { error: branchError } = await this.client.from("branches").upsert({ id: "main", workspace_id: workspaceId, label: "main" }, { onConflict: "workspace_id,id", ignoreDuplicates: true });
    if (branchError) throw branchError;
    return (await this.getWorkspace(workspaceId)) ?? { id: workspaceId, createdAt: now, lastSeenAt: now, firmLabel: "Miraflores demo" };
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const { data, error } = await this.client
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      createdAt: data.created_at,
      lastSeenAt: data.last_seen_at,
      firmLabel: data.firm_label,
    };
  }

  async listEvents(
    workspaceId: string,
    branchId: string,
  ): Promise<StoredEvent[]> {
    if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace id");
    const { data: branch, error: branchError } = await this.client.from("branches").select("base_events").eq("workspace_id", workspaceId).eq("id", branchId).maybeSingle();
    if (branchError) throw branchError;
    const events: StoredEvent[] = inheritedEvents((branch?.base_events ?? []).map((e:unknown) => StoredEventSchema.parse(e)), branchId);
    let after = 0;
    for (;;) {
      const { data, error } = await this.client.from("events").select("*").eq("workspace_id", workspaceId).eq("branch_id", branchId).gt("sequence", after).order("sequence", { ascending: true }).limit(500);
      if (error) throw error;
      const rows = data ?? [];
      events.push(...rows.map(rowToEvent));
      if (rows.length < 500) return events;
      after = rows[rows.length - 1].sequence;
    }
  }

  async getBranch(workspaceId: string, branchId: string): Promise<BranchRecord | null> {
    if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace");
    const { data, error } = await this.client.from("branches").select("id,label,created_at,parent_branch_id,parent_snapshot_id,mode").eq("workspace_id",workspaceId).eq("id",branchId).maybeSingle();
    if (error) throw error;
    return data ? rowToBranch(data) : null;
  }
  async listBranches(workspaceId: string): Promise<BranchRecord[]> {
    if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace");
    const { data, error } = await this.client.from("branches").select("id,label,created_at,parent_branch_id,parent_snapshot_id,mode").eq("workspace_id",workspaceId).order("created_at");
    if (error) throw error;
    return (data ?? []).map(rowToBranch);
  }
  async createBranch(input: CreateBranchInput): Promise<AppendEventsResult> {
    if (!validWorkspaceId(input.workspaceId)) return { ok:false, code:"isolation",message:"Invalid workspace" };
    const invalid = branchValidation(input, await this.listEvents(input.workspaceId, input.branch.parentBranchId ?? ''));
    if (invalid) return { ok:false,code:"validation",message:invalid };
    const event = StoredEventSchema.parse({ ...input.creationEvent, sequence:input.baseEvents.length+1 });
    const { data, error } = await this.client.rpc("create_workspace_branch", {
      p_workspace:input.workspaceId,
      p_branch:{ id:input.branch.id, label:input.branch.label, parent_branch_id:input.branch.parentBranchId, parent_snapshot_id:input.branch.parentSnapshotId, mode:input.branch.mode },
      p_base_events:input.baseEvents,
      p_event:{ id:event.id, workspace_id:event.workspaceId,branch_id:event.branchId,actor_id:event.actorId,recorded_at:event.recordedAt,effective_at:event.effectiveAt,type:event.type,target_refs:event.targetRefs,evidence_refs:event.evidenceRefs,reason:event.reason,payload:event.payload,idempotency_key:event.idempotencyKey },
    });
    if (error) throw error;
    if (!data.ok) return data as AppendEventsResult;
    return { ok:true,events:(data.events as Record<string,unknown>[]).map(rowToEvent),deduped:data.deduped };
  }

  async appendEvents(input: AppendEventsInput): Promise<AppendEventsResult> {
    if (!validWorkspaceId(input.workspaceId)) return { ok: false, code: "isolation", message: "Invalid workspace" };

    const batchId =
      input.events.length > 1
        ? input.events[0].batchId ?? `batch_${crypto.randomUUID()}`
        : input.events[0]?.batchId;

    let seq = 0;
    const rows = [];
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
      rows.push({
        id: event.id,
        workspace_id: event.workspaceId,
        branch_id: event.branchId,
        sequence: event.sequence,
        actor_id: event.actorId,
        recorded_at: event.recordedAt,
        effective_at: event.effectiveAt,
        type: event.type,
        target_refs: event.targetRefs,
        evidence_refs: event.evidenceRefs,
        reason: event.reason ?? null,
        payload: event.payload,
        idempotency_key: event.idempotencyKey,
        batch_id: event.batchId ?? null,
        reverses_event_id: event.reversesEventId ?? null,
      });
    }

    const { data, error } = await this.client.rpc("append_workspace_events", {
      p_workspace: input.workspaceId, p_branch: input.branchId,
      p_expected: input.expectedBranchSequence ?? null, p_events: rows,
    });
    if (error) throw error;
    if (!data.ok) return data as AppendEventsResult;
    return { ok: true, events: (data.events as Record<string, unknown>[]).map(rowToEvent), deduped: data.deduped };

  }
}

function rowToEvent(row: Record<string, unknown>): StoredEvent {
  return StoredEventSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    branchId: row.branch_id,
    sequence: row.sequence,
    actorId: row.actor_id,
    recordedAt: row.recorded_at,
    effectiveAt: row.effective_at,
    type: row.type,
    targetRefs: row.target_refs,
    evidenceRefs: row.evidence_refs,
    reason: row.reason ?? undefined,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    batchId: row.batch_id ?? undefined,
    reversesEventId: row.reverses_event_id ?? undefined,
  });
}

function rowToBranch(row: Record<string,unknown>): BranchRecord {
  return { id:String(row.id), label:String(row.label), createdAt:String(row.created_at), parentBranchId:row.parent_branch_id ? String(row.parent_branch_id):undefined, parentSnapshotId:row.parent_snapshot_id ? String(row.parent_snapshot_id):undefined, mode:row.mode === 'amendment' || row.mode === 'successor' ? row.mode:undefined };
}
