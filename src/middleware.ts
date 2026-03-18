/**
 * WHY: Next.js edge middleware that enforces route-level auth guards.
 *
 * The middleware runs before any page renders, making it the first line of
 * defense. Two rules:
 *   1. Unauthenticated users hitting /dashboard/* are redirected to /login.
 *   2. Authenticated users hitting /login or /signup are redirected to
 *      /dashboard (avoids a confusing "sign in when already signed in" state).
 *
 * We check session existence by reading the BetterAuth session cookie directly.
 * This keeps the middleware lightweight and edge-compatible — importing auth.ts
 * (which uses pg) in the middleware would pull Node.js-only code into the Vercel
 * Edge Runtime and crash. Full session validation (signature + expiry check)
 * happens in the dashboard layout server component, which runs in the Node.js
 * runtime where pg is available.
 *
 * BetterAuth's default session cookie name is "better-auth.session_token".
 * If you customise the cookie prefix in auth.ts, update the constant below.
 */

import { type NextRequest, NextResponse } from 'next/server';

const BETTER_AUTH_SESSION_COOKIE = 'better-auth.session_token';

const PROTECTED_PATH_PREFIXES = ['/dashboard'];
const AUTH_PATH_PREFIXES = ['/login', '/signup'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(BETTER_AUTH_SESSION_COOKIE);
  const hasSession = sessionCookie !== undefined;
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPath(pathname) && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
