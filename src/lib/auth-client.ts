/**
 * WHY: BetterAuth client for React components.
 *
 * BetterAuth splits its API into a server-only engine (src/lib/auth.ts) and
 * a browser-safe client (this file). Importing auth.ts in a client component
 * would pull pg and server-only code into the browser bundle — that's why
 * this separate client exists.
 *
 * Exports:
 *   authClient  — the full client, useful when you need methods beyond the named exports
 *   signIn      — .email(credentials) and .social(provider) sign-in methods
 *   signOut     — terminates the session and clears the cookie
 *   signUp      — .email(credentials) registration method
 *   useSession  — React hook that returns { data, isPending, error }
 *
 * The baseURL is optional: BetterAuth infers it from the current window origin,
 * which is correct for all same-origin deployments. NEXT_PUBLIC_BETTER_AUTH_URL
 * lets us override it when the auth API lives on a different domain or proxy.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const { signIn, signOut, signUp, useSession } = authClient;
