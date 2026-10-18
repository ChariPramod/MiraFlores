import { NextResponse, type NextRequest } from 'next/server';

/** Cheap cookie-presence routing only. Every server entry point verifies the
 * signed capability in session.ts; proxy presence is never authorization. */
export function proxy(request: NextRequest) {
  if (!request.cookies.get('wp_session') && request.nextUrl.pathname !== '/api/session') {
    const url = new URL('/api/session', request.url);
    url.searchParams.set('returnTo', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
