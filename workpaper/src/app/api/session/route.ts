import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions, SESSION_COOKIE, signCapability, verifyCapability } from '@/lib/security/tokens';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('returnTo') ?? '/collaboration';
  const destination = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') && !raw.startsWith('/api/session') ? raw : '/collaboration';
  const response = NextResponse.redirect(new URL(destination, request.url));
  if (!verifyCapability(request.cookies.get(SESSION_COOKIE)?.value, 'session')) {
    response.cookies.set(SESSION_COOKIE, signCapability({ kind:'session', workspaceId:`ws_${randomBytes(18).toString('hex')}`, personaId:'st-01', locked:false, expires:Date.now()+cookieOptions.maxAge*1000 }), cookieOptions);
  }
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
