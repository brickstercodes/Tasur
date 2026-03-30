/**
 * WHY: Thin proxy to the Go pipeline service, which handles the full .mm-first
 * pipeline without Vercel's 60s timeout constraint.
 *
 * This route:
 *   1. Verifies the BetterAuth session (auth stays in Next.js)
 *   2. Resolves the app-level userId
 *   3. Forwards the raw multipart body + userId header to the Go service
 *   4. Pipes the SSE response back to the client unchanged
 *
 * The Go service owns: text extraction, .mm generation, XML parsing,
 * flashcard generation, and all Supabase writes.
 *
 * The maxDuration cap remains but is irrelevant — the Go service holds the
 * open connection; Next.js is just piping bytes end-to-end.
 */

export const maxDuration = 60;

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

function resolveGoServiceUrl(): string | undefined {
  const configured = process.env.GO_SERVICE_URL?.trim();
  if (configured) return configured;

  // Railway private DNS fallback keeps uploads alive even if env injection is delayed.
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return 'http://tasur.railway.internal:8080';
  }

  return undefined;
}

export async function POST(req: Request) {
  // ── Auth (handled entirely in Next.js) ──────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = await resolveAppUserId(session.user);

  // ── Forward to Go service ─────────────────────────────────────────────────
  const goServiceUrl = resolveGoServiceUrl();
  if (!goServiceUrl) {
    return new Response('Pipeline service unavailable: GO_SERVICE_URL is not configured in the Nextjs service runtime.', { status: 503 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  let goResponse: Response;
  try {
    goResponse = await fetch(`${goServiceUrl}/pipeline/upload`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-user-id': userId,
        'x-max-sessions': process.env.MAX_SESSIONS_PER_USER ?? '10',
      },
      // @ts-expect-error — Node.js fetch requires duplex for streaming request bodies
      duplex: 'half',
      body: req.body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline service unreachable';
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
    return new Response(errorEvent, { headers: SSE_HEADERS });
  }

  // Pipe the SSE stream from the Go service straight back to the client.
  return new Response(goResponse.body, { headers: SSE_HEADERS });
}
