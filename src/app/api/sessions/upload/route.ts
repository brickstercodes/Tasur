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

  // Production fallback: in Railway this private DNS reaches the Go service.
  // We keep this behind NODE_ENV=production so local dev isn't silently rerouted.
  if (process.env.NODE_ENV === 'production') {
    return 'http://tasur.railway.internal:8080';
  }

  return undefined;
}

function formatUpstreamError(err: unknown, targetUrl: string): string {
  if (!(err instanceof Error)) {
    return `Pipeline service unreachable (${targetUrl})`;
  }

  const cause = err.cause as
    | {
        code?: string;
        syscall?: string;
        hostname?: string;
        address?: string;
        port?: number;
        message?: string;
      }
    | undefined;

  const extras: string[] = [];
  if (cause?.code) extras.push(`code=${cause.code}`);
  if (cause?.syscall) extras.push(`syscall=${cause.syscall}`);
  if (cause?.hostname) extras.push(`host=${cause.hostname}`);
  if (cause?.address) extras.push(`address=${cause.address}`);
  if (cause?.port) extras.push(`port=${cause.port}`);

  const suffix = extras.length > 0 ? ` [${extras.join(', ')}]` : '';
  return `Pipeline service unreachable (${targetUrl}): ${err.message}${suffix}`;
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
    const debug = `debug(node_env=${process.env.NODE_ENV ?? 'unknown'}, has_go_service_url=${Boolean(process.env.GO_SERVICE_URL)})`;
    return new Response(`Pipeline service unavailable: GO_SERVICE_URL is not configured in the Nextjs service runtime. ${debug}`, { status: 503 });
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
    const message = formatUpstreamError(err, `${goServiceUrl}/pipeline/upload`);
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
    return new Response(errorEvent, { headers: SSE_HEADERS });
  }

  if (!goResponse.ok) {
    const upstreamText = await goResponse.text().catch(() => '');
    const message = upstreamText
      ? `Pipeline service returned ${goResponse.status}: ${upstreamText}`
      : `Pipeline service returned ${goResponse.status}`;
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
    return new Response(errorEvent, { headers: SSE_HEADERS });
  }

  if (!goResponse.body) {
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'Pipeline service returned an empty response body.' })}\n\n`;
    return new Response(errorEvent, { headers: SSE_HEADERS });
  }

  // Pipe the SSE stream from the Go service straight back to the client.
  return new Response(goResponse.body, { headers: SSE_HEADERS });
}
