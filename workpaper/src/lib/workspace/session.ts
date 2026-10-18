import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifyCapability } from '@/lib/security/tokens';
import { persona } from '@/lib/security/policy';
export const DEFAULT_PERSONA = 'st-01';
export const DEFAULT_SIMULATION_DATE = '2026-06-23';
export const DEFAULT_VERSION = 'v3';
export type WorkspaceSession = { workspaceId: string; personaId: string; version: string; simulationDate: string; branchId: string; isNew: boolean; locked: boolean };
export async function getOrCreateWorkspaceSession(): Promise<WorkspaceSession> {
  const jar = await cookies();
  const cap = verifyCapability(jar.get(SESSION_COOKIE)?.value, 'session');
  if (!cap) redirect('/api/session');
  if (!persona(cap.personaId, DEFAULT_SIMULATION_DATE)) throw new Error('Inactive workspace persona');
  return { workspaceId: cap.workspaceId, personaId: cap.personaId, version: DEFAULT_VERSION, simulationDate: DEFAULT_SIMULATION_DATE, branchId: cap.branchId ?? 'main', isNew: false, locked: cap.locked };
}
export async function getWorkpaperSession(): Promise<WorkspaceSession> {
  const session = await getOrCreateWorkspaceSession();
  const role = persona(session.personaId, session.simulationDate)?.role;
  if (!['preparer','reviewer','partner','quality_reviewer'].includes(role ?? '')) redirect('/collaboration');
  return session;
}
