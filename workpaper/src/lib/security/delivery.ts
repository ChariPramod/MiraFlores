import 'server-only';
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { WorkspaceSession } from '@/lib/workspace/session';
import { createSupabaseAdmin, isSupabaseConfigured } from '@/lib/persistence/supabase-store';
import { getEventStore } from '@/lib/persistence/get-store';
import { containsSensitive, redact } from './redaction';
import { persona } from './policy';

/** Audit is a separate stream: views never invalidate business sign-offs or polling revisions. */
export async function deliver<T>(session: WorkspaceSession, resource: string, dto: T): Promise<T> {
  if (persona(session.personaId)?.cleared && containsSensitive(dto)) {
    const row = { id: randomUUID(), workspace_id: session.workspaceId, actor_id: session.personaId, resource, recorded_at: new Date().toISOString() };
    if (isSupabaseConfigured()) {
      // A direct document visit can precede any event-backed page in this session.
      await getEventStore().ensureWorkspace(session.workspaceId);
      const { error } = await createSupabaseAdmin().from('sensitive_access_log').insert(row);
      if (error) throw new Error('Cannot deliver unmasked data: access audit failed');
    } else {
      if (process.env.VERCEL) throw new Error('Persistent audit storage is required');
      const dir = path.join(process.cwd(), '.data', 'audit');
      mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, `${session.workspaceId}.jsonl`), JSON.stringify(row) + '\n', { mode: 0o600 });
    }
  }
  return redact(dto, session.personaId);
}

export async function listAccessAudit(session: WorkspaceSession): Promise<Array<{id:string;actor_id:string;resource:string;recorded_at:string}>> {
  if (persona(session.personaId)?.role !== 'firm_administrator') throw new Error('Access logs require the administrator role');
  if (isSupabaseConfigured()) {
    const {data,error}=await createSupabaseAdmin().from('sensitive_access_log').select('id,actor_id,resource,recorded_at').eq('workspace_id',session.workspaceId).order('recorded_at',{ascending:false}).limit(100);
    if(error)throw error;
    return data ?? [];
  }
  const file=path.join(process.cwd(),'.data','audit',`${session.workspaceId}.jsonl`);
  return existsSync(file) ? readFileSync(file,'utf8').trim().split('\n').filter(Boolean).slice(-100).reverse().map(line=>JSON.parse(line)) : [];
}
