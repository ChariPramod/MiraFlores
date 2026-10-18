import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type Capability = { kind: 'session' | 'invite'; workspaceId: string; personaId: string; locked: boolean; branchId?: string; expires: number };
export const SESSION_COOKIE = 'wp_session';
export const validBranchId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export const validWorkspaceId = (id: string) => /^ws_[a-zA-Z0-9_-]{8,80}$/.test(id);
function secret(): string {
  if (process.env.WORKSPACE_SESSION_SECRET) return process.env.WORKSPACE_SESSION_SECRET;
  if (process.env.VERCEL) throw new Error('WORKSPACE_SESSION_SECRET is required on Vercel');
  const dir = path.join(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'session-secret');
  if (!existsSync(file)) {
    try { writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (!existsSync(file)) throw error; }
  }
  return readFileSync(file, 'utf8').trim();
}
export function signCapability(value: Capability): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}
export function verifyCapability(token: string | undefined, kind: Capability['kind']): Capability | null {
  if (!token || token.length > 2048) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra) return null;
  const expected = createHmac('sha256', secret()).update(body).digest();
  const supplied = Buffer.from(mac, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString()) as Capability;
    return v.kind === kind && (v.branchId === undefined || (typeof v.branchId === 'string' && validBranchId(v.branchId))) && validWorkspaceId(v.workspaceId) && typeof v.personaId === 'string' && typeof v.locked === 'boolean' && Number.isFinite(v.expires) && v.expires > Date.now() ? v : null;
  } catch { return null; }
}
export const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 180 };
