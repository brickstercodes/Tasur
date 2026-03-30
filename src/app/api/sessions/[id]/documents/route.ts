/**
 * WHY: Thin proxy to the Go pipeline service for adding a second document to
 * an existing session. Auth is verified here; session ownership and all
 * pipeline work are delegated to the Go service.
 *
 * POST /api/sessions/[id]/documents
 *   Accepts: multipart/form-data { file, domain?, customInstructions? }
 *   Returns: text/event-stream (identical SSE events to the primary upload)
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

function normalizeGoServiceUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  try {
    const parsed = new URL(value);
    // Railway can expose the same private service as "<name>.railway.internal"
    // and as the short alias "<name>". Some runtimes resolve only the short alias.
    if (parsed.hostname.endsWith('.railway.internal')) {
      parsed.hostname = parsed.hostname.replace(/\.railway\.internal$/, '');
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // Keep original value if URL parsing fails.
  }
  return value;
}

function resolveGoServiceUrl(): string | undefined {
  const configured = process.env.GO_SERVICE_URL?.trim();
  if (configured) return normalizeGoServiceUrl(configured);

  // Production fallback: in Railway this private DNS reaches the Go service.
  // We keep this behind NODE_ENV=production so local dev isn't silently rerouted.
  if (process.env.NODE_ENV === 'production') {
    return 'http://tasur:8080';
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
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
    goResponse = await fetch(`${goServiceUrl}/pipeline/document/${sessionId}`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-user-id': userId,
      },
      // @ts-expect-error — Node.js fetch requires duplex for streaming request bodies
      duplex: 'half',
      body: req.body,
    });
  } catch (err) {
    const message = formatUpstreamError(err, `${goServiceUrl}/pipeline/document/${sessionId}`);
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

  return new Response(goResponse.body, { headers: SSE_HEADERS });
}
