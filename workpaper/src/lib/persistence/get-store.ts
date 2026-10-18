import "server-only";

import { FileEventStore } from "./file-store";
import { isSupabaseConfigured, SupabaseEventStore } from "./supabase-store";
import type { EventStore } from "./store";

let cached: EventStore | null = null;

/**
 * Prefer Supabase when credentials are present; otherwise durable local
 * `.data/workspaces` (survives restarts, isolated per workspace id).
 */
export function getEventStore(): EventStore {
  if (cached) return cached;
  if (isSupabaseConfigured()) {
    cached = new SupabaseEventStore();
  } else {
    if (process.env.VERCEL) throw new Error("Supabase is required for persistent deployment on Vercel");
    cached = new FileEventStore();
  }
  return cached;
}

export function persistenceMode(): "supabase" | "local_file" {
  return isSupabaseConfigured() ? "supabase" : "local_file";
}

/** Test-only: reset cached singleton. */
export function resetEventStoreCache(): void {
  cached = null;
}
