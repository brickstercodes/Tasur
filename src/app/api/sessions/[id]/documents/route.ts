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
  const goServiceUrl = process.env.GO_SERVICE_URL?.trim();
  if (!goServiceUrl) {
    return new Response('Pipeline service unavailable: GO_SERVICE_URL is not configured in the Nextjs service runtime.', { status: 503 });
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
    const message = err instanceof Error ? err.message : 'Pipeline service unreachable';
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
    return new Response(errorEvent, { headers: SSE_HEADERS });
  }

  return new Response(goResponse.body, { headers: SSE_HEADERS });
}
