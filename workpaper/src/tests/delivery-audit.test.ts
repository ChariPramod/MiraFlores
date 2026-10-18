import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliver } from '@/lib/security/delivery';
import { renderDocumentPage } from '@/lib/documents/renderer';
import { containsSensitive } from '@/lib/security/redaction';
import type { WorkspaceSession } from '@/lib/workspace/session';

type AuditRow = { workspace_id:string; actor_id:string; resource:string };
const db = vi.hoisted(() => ({
  workspaces:new Set<string>(),
  ensureWorkspace:vi.fn<(id:string) => Promise<void>>(),
  insert:vi.fn<(row:AuditRow) => Promise<{error:Error|null}>>(),
}));
vi.mock('@/lib/persistence/get-store', () => ({
  getEventStore:() => ({ensureWorkspace:db.ensureWorkspace}),
}));
vi.mock('@/lib/persistence/supabase-store', () => ({
  isSupabaseConfigured:() => true,
  createSupabaseAdmin:() => ({from:() => ({insert:db.insert})}),
}));

const session:WorkspaceSession = {
  workspaceId:'ws_fresh_audit_test',personaId:'st-01',version:'v3',
  simulationDate:'2026-06-23',branchId:'main',isNew:false,locked:false,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.workspaces.clear();
  db.ensureWorkspace.mockImplementation(async id => {
    await Promise.resolve();
    db.workspaces.add(id);
  });
  // Model the hosted audit table's workspace foreign key.
  db.insert.mockImplementation(async row => ({
    error:db.workspaces.has(row.workspace_id) ? null : new Error('Audit workspace foreign key violation'),
  }));
});

describe('sensitive delivery audit', () => {
  it('initializes a fresh signed-session workspace before auditing a direct document visit', async () => {
    const document = renderDocumentPage('D06',1);
    expect(containsSensitive(document)).toBe(true);
    expect(db.workspaces.size).toBe(0);
    expect(await deliver(session,'document:D06:1',document)).toEqual(document);
    expect(db.ensureWorkspace).toHaveBeenCalledWith(session.workspaceId);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id:session.workspaceId,actor_id:session.personaId,resource:'document:D06:1',
    }));

    // Returning visits retain the workspace and append another access record.
    expect(await deliver(session,'document:D06:1',document)).toEqual(document);
    expect([...db.workspaces]).toEqual([session.workspaceId]);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('does not deliver unmasked content when workspace initialization fails', async () => {
    db.ensureWorkspace.mockRejectedValueOnce(new Error('Workspace unavailable'));
    await expect(deliver(session,'document:D06:1',renderDocumentPage('D06',1)))
      .rejects.toThrow('Workspace unavailable');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('remains fail-closed when the access audit cannot be written', async () => {
    db.insert.mockResolvedValueOnce({error:new Error('Audit unavailable')});
    await expect(deliver(session,'document:D06:1',renderDocumentPage('D06',1)))
      .rejects.toThrow('Cannot deliver unmasked data: access audit failed');
  });

  it('redacts uncleared document access without creating an unmasked-view audit', async () => {
    const document = renderDocumentPage('D06',1);
    const result = await deliver({...session,personaId:'st-04'},'document:D06:1',document);
    expect(result).not.toEqual(document);
    expect(containsSensitive(result)).toBe(false);
    expect(db.ensureWorkspace).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
