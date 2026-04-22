/**
 * WHY: Mints a short-lived HMAC-SHA256 upload token so the browser can POST
 * large files directly to the Go pipeline service, bypassing Vercel's
 * FUNCTION_PAYLOAD_TOO_LARGE (4.5 MB) limit on serverless functions.
 *
 * Flow:
 *   1. Browser asks Next.js for a token (tiny request — no file involved).
 *   2. Next.js verifies the BetterAuth session and mints a signed token.
 *   3. Browser POSTs the file directly to the Go service using the token.
 *
 * The Go service validates the token with validateUploadToken() when
 * UPLOAD_TOKEN_SECRET is set. Without the secret, direct upload is
 * unavailable and the caller falls back to the Vercel proxy path.
 *
 * Token format (mirrors validateUploadToken in go-pipeline/pipeline.go):
 *   "<userId>:<expiryUnix>.<hmac_sha256_hex>"
 */

import { createHmac } from 'crypto';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';

// Token is valid for 5 minutes — enough for any upload, short enough to limit
// replay window.
const TOKEN_TTL_SECONDS = 300;

export async function GET() {
  const secret = process.env.UPLOAD_TOKEN_SECRET;
  if (!secret) {
    // Direct upload not configured — caller will fall back to proxy.
    return Response.json({ error: 'Direct upload not configured' }, { status: 503 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = await resolveAppUserId(session.user);
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${userId}:${expiry}`;

  const mac = createHmac('sha256', secret);
  mac.update(payload);
  const token = `${payload}.${mac.digest('hex')}`;

  // Return the Go service URL so the client doesn't need a NEXT_PUBLIC_ var.
  const goServiceUrl = (
    process.env.GO_SERVICE_PUBLIC_URL ??
    process.env.GO_SERVICE_URL ??
    ''
  ).trim().replace(/\/$/, '');

  return Response.json({ token, userId, goServiceUrl });
}
