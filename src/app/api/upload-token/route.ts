/**
 * WHY: Mints a short-lived HMAC upload token so the browser can POST files
 * directly to the Go pipeline service, bypassing Vercel's 4.5 MB function
 * payload limit.
 *
 * Flow:
 *   1. Client calls GET /api/upload-token (authenticated via BetterAuth cookie).
 *   2. This endpoint verifies the session, resolves the app userId, and mints
 *      a signed token: HMAC-SHA256(UPLOAD_TOKEN_SECRET, "userId:expiry").
 *   3. Returns { uploadUrl, token, userId } to the client.
 *   4. Client POSTs the file directly to uploadUrl/pipeline/upload (or
 *      /pipeline/document/:id) with X-Upload-Token and X-User-Id headers.
 *   5. Go validates the token before processing.
 */

import { headers } from 'next/headers';
import { createHmac } from 'crypto';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';

/** Token lifetime — 10 minutes is generous for any upload flow. */
const TOKEN_TTL_SECONDS = 600;

function mintUploadToken(userId: string): string {
  const secret = process.env.UPLOAD_TOKEN_SECRET;
  if (!secret) throw new Error('UPLOAD_TOKEN_SECRET is not configured');
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${userId}:${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function resolvePublicGoUrl(): string | undefined {
  const explicit = process.env.GO_SERVICE_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  // Infer from the app's own domain: tasur.example.com → api.tasur.example.com
  const appUrl = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? '').trim();
  if (!appUrl) return undefined;
  try {
    const parsed = new URL(appUrl);
    if (parsed.hostname === 'localhost' || parsed.hostname.startsWith('127.')) return undefined;
    if (parsed.hostname.startsWith('api.')) return parsed.origin;
    return `${parsed.protocol}//api.${parsed.hostname}`;
  } catch {
    return undefined;
  }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const userId = await resolveAppUserId(session.user);

  const uploadUrl = resolvePublicGoUrl();
  if (!uploadUrl) {
    return new Response('GO_SERVICE_PUBLIC_URL is not configured', { status: 503 });
  }

  let token: string;
  try {
    token = mintUploadToken(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token error';
    return new Response(msg, { status: 503 });
  }

  return Response.json({ uploadUrl, token, userId });
}
