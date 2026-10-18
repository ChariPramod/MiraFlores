'use server';
import { cookies } from 'next/headers';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';
import { activePersonas, persona } from '@/lib/security/policy';
import { cookieOptions, SESSION_COOKIE, signCapability, verifyCapability, validBranchId } from '@/lib/security/tokens';
import { getEventStore } from '@/lib/persistence/get-store';

export async function switchPersona(id: string) {
  const session = await getOrCreateWorkspaceSession();
  if (session.locked || !activePersonas(session.simulationDate).some(p => p.id === id)) return { ok: false, message: 'This session cannot select that persona.' };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signCapability({ kind:'session', workspaceId:session.workspaceId, personaId:id, branchId:session.branchId, locked:false, expires:Date.now()+cookieOptions.maxAge*1000 }), cookieOptions);
  return { ok:true };
}
export async function createInvite(personaId: string) {
  const session = await getOrCreateWorkspaceSession();
  if (session.locked || persona(session.personaId)?.role === 'client' || !persona(personaId, session.simulationDate)) return { ok:false, message:'Only an owner staff session may invite an active persona.' };
  await getEventStore().ensureWorkspace(session.workspaceId);
  return { ok:true, token:signCapability({ kind:'invite', workspaceId:session.workspaceId, personaId, branchId:session.branchId, locked:true, expires:Date.now()+60*60*1000 }) };
}
export async function joinWorkspace(token: string) {
  const cap = verifyCapability(token, 'invite');
  if (!cap || !persona(cap.personaId) || !await getEventStore().getWorkspace(cap.workspaceId)) return { ok:false, message:'Invitation is invalid or expired.' };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signCapability({ ...cap, kind:'session', locked:true }), { ...cookieOptions, maxAge:Math.max(0,Math.floor((cap.expires-Date.now())/1000)) });
  return { ok:true };
}

export async function selectBranch(branchId: string) {
  const session = await getOrCreateWorkspaceSession();
  if (!validBranchId(branchId)) return { ok:false, message:'Invalid branch.' };
  const store = getEventStore();
  await store.ensureWorkspace(session.workspaceId);
  if (!await store.getBranch(session.workspaceId, branchId)) return { ok:false, message:'Branch is unavailable in this workspace.' };
  const jar = await cookies();
  const cap = verifyCapability(jar.get(SESSION_COOKIE)?.value, 'session');
  if (!cap) return { ok:false, message:'Session expired.' };
  jar.set(SESSION_COOKIE, signCapability({ ...cap, branchId }), { ...cookieOptions, maxAge:Math.max(0, Math.floor((cap.expires-Date.now())/1000)) });
  return { ok:true };
}
