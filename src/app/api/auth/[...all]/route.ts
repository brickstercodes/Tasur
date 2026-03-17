/**
 * WHY: BetterAuth catch-all API handler for all auth endpoints.
 *
 * BetterAuth exposes many endpoints under /api/auth/* — sign-in, sign-up,
 * sign-out, session retrieval, OAuth callbacks, and more. Rather than
 * defining each individually, toNextJsHandler wraps the entire BetterAuth
 * instance in a single Next.js App Router handler that responds to both
 * GET (session reads, OAuth redirects) and POST (credential sign-in/up).
 */

import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth);
