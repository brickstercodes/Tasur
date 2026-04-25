/**
 * WHY: Single endpoint that powers the Notesportal "Study with Tasur" button.
 *
 * Flow:
 *   1. Auth-gate. Unauth → 401 (the client redirects to /signup with the
 *      pending import params stashed in sessionStorage).
 *   2. Validate the request: known source, fileUrl host whitelisted.
 *   3. Dedup check via lookupImportedSession. If a previous user already
 *      imported this exact (source, sourceId), attach the current user as
 *      a session_share + bootstrap understanding_state, then return
 *      { dedup: true, sessionId } — instant, no reprocessing.
 *   4. First-time import: server-fetch the PDF (with size cap), build a
 *      multipart body, forward to the Go pipeline, and stream SSE back.
 *      A passthrough TransformStream watches for the `session_created`
 *      event and persists the (source, sourceId, sessionId) mapping so
 *      the next user gets the dedup path.
 *
 * Why server-fetch vs client-fetch:
 *   - Avoids browser CORS issues with notesportal.tech.
 *   - Lets us enforce host + size limits before bytes touch the pipeline.
 *   - Keeps the client thin: just POSTs JSON, reads SSE.
 *
 * Why a single endpoint vs check + upload:
 *   - The dedup check needs auth, and the upload needs auth. Splitting
 *     buys nothing and doubles the round-trips.
 */

export const maxDuration = 300;

import { headers } from 'next/headers';
import { resolveAppUserId } from '@/lib/app-user';
import { auth } from '@/lib/auth';
import {
  attachUserToImportedSession,
  isAllowedFileUrl,
  isAllowedSource,
  lookupImportedSession,
  recordImportedSession,
  type ImportSource,
} from '@/lib/imported-source';

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB — matches /api/sessions/upload

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

// ── Go service URL resolution (mirrors /api/sessions/upload) ─────────────

function normalizeGoServiceUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  try {
    const parsed = new URL(value);
    if (parsed.hostname.endsWith('.railway.internal')) {
      parsed.hostname = parsed.hostname.replace(/\.railway\.internal$/, '');
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    /* keep original */
  }
  return value;
}

function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_STATIC_URL,
  );
}

function derivePublicApiFallback(): string | undefined {
  const fromEnv = process.env.GO_SERVICE_PUBLIC_URL?.trim();
  if (fromEnv) return normalizeGoServiceUrl(fromEnv);

  const authBase =
    process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
  if (!authBase) return undefined;

  try {
    const parsed = new URL(authBase);
    if (parsed.hostname === 'localhost' || parsed.hostname.startsWith('127.')) return undefined;
    if (parsed.hostname.startsWith('api.')) return parsed.origin;
    return `${parsed.protocol}//api.${parsed.hostname}`;
  } catch {
    return undefined;
  }
}

function resolveGoServiceUrl(): string | undefined {
  const configured = process.env.GO_SERVICE_URL?.trim();
  if (configured) return normalizeGoServiceUrl(configured);

  const publicFallback = derivePublicApiFallback();
  if (publicFallback) return publicFallback;

  if (isRailwayRuntime()) return 'http://tasur:8080';
  return undefined;
}

// ── SSE event helper ──────────────────────────────────────────────────────

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseErrorResponse(message: string, status = 200): Response {
  // Status 200 because EventSource readers expect 200 — surface errors
  // through SSE events, not HTTP. Matches /api/sessions/upload semantics.
  return new Response(sseEvent({ type: 'error', message }), {
    status,
    headers: SSE_HEADERS,
  });
}

// ── Filename helpers ──────────────────────────────────────────────────────

function fileNameFromUrl(fileUrl: string, fallback: string): string {
  try {
    const path = new URL(fileUrl).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  } catch {
    /* fall through */
  }
  // Otherwise synthesize from the title or sourceId.
  return `${fallback.replace(/[^\w.-]+/g, '_')}.pdf`;
}

// ── Main handler ──────────────────────────────────────────────────────────

interface ImportRequestBody {
  source?: string;
  sourceId?: string;
  fileUrl?: string;
  title?: string;
  subject?: string;
  mode?: 'fast' | 'steady';
  generateFlashcards?: boolean;
}

export async function POST(req: Request) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) {
    return Response.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }
  const appUserId = await resolveAppUserId(authSession.user);

  // ── 2. Validate body ────────────────────────────────────────────────────
  let body: ImportRequestBody;
  try {
    body = (await req.json()) as ImportRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const source = (body.source ?? '').trim();
  const sourceId = (body.sourceId ?? '').trim();
  const fileUrl = (body.fileUrl ?? '').trim();
  const title = (body.title ?? '').trim();
  const subject = (body.subject ?? '').trim() || 'general';
  const mode: 'fast' | 'steady' = body.mode === 'fast' ? 'fast' : 'steady';
  const generateFlashcards = body.generateFlashcards !== false; // default true

  if (!isAllowedSource(source)) {
    return Response.json({ error: `Unsupported source: ${source || '(missing)'}` }, { status: 400 });
  }
  if (!sourceId || !fileUrl || !title) {
    return Response.json(
      { error: 'sourceId, fileUrl, and title are required' },
      { status: 400 },
    );
  }
  if (!isAllowedFileUrl(source, fileUrl)) {
    return Response.json(
      { error: 'fileUrl host is not whitelisted for this source' },
      { status: 400 },
    );
  }

  const importSource: ImportSource = source;

  // ── 3. Dedup: has someone already imported this exact note? ────────────
  const existing = await lookupImportedSession(importSource, sourceId);
  if (existing) {
    try {
      await attachUserToImportedSession(existing.sessionId, existing.ownerId, appUserId);
    } catch (err) {
      console.error('[import/notesportal] attach failed', err);
      // Fall through — owner can still see their own session even if attach
      // failed for a stranger; surface a friendly error in that case below.
      if (existing.ownerId !== appUserId) {
        return Response.json(
          { error: 'Failed to attach you to the shared session.' },
          { status: 500 },
        );
      }
    }
    return Response.json({
      sessionId: existing.sessionId,
      dedup: true,
    });
  }

  // ── 4. First-time import: fetch the PDF, forward to Go ──────────────────
  const goServiceUrl = resolveGoServiceUrl();
  if (!goServiceUrl) {
    return sseErrorResponse('Pipeline service unavailable: GO_SERVICE_URL is not configured.');
  }

  // Fetch the file from the partner. We trust the host whitelist + size cap.
  let fileResp: Response;
  try {
    fileResp = await fetch(fileUrl, { redirect: 'follow' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return sseErrorResponse(`Could not fetch the file from ${fileUrl}: ${detail}`);
  }

  if (!fileResp.ok) {
    return sseErrorResponse(
      `Source returned ${fileResp.status} for the file URL. The note may have been removed.`,
    );
  }

  // Size gate — try Content-Length first, then arrayBuffer length.
  const contentLength = parseInt(fileResp.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    const sizeMB = (contentLength / (1024 * 1024)).toFixed(1);
    return sseErrorResponse(
      `The source file is ${sizeMB} MB — the maximum is 25 MB. Ask the partner to split into chapters.`,
    );
  }

  const fileBuf = Buffer.from(await fileResp.arrayBuffer());
  if (fileBuf.byteLength > MAX_BODY_BYTES) {
    const sizeMB = (fileBuf.byteLength / (1024 * 1024)).toFixed(1);
    return sseErrorResponse(
      `The source file is ${sizeMB} MB — the maximum is 25 MB. Ask the partner to split into chapters.`,
    );
  }

  // Determine MIME / extension. Notesportal serves PDFs but be defensive.
  const upstreamMime =
    fileResp.headers.get('content-type')?.split(';')[0].trim() || 'application/pdf';
  const fileName = fileNameFromUrl(fileUrl, title);

  // Build the multipart form. Use Web FormData/Blob so fetch picks the right
  // boundary automatically.
  const goForm = new FormData();
  goForm.append('file', new Blob([fileBuf], { type: upstreamMime }), fileName);
  goForm.append('title', title);
  goForm.append('domain', subject);
  goForm.append('mode', mode);
  goForm.append('generateFlashcards', String(generateFlashcards));

  let goResponse: Response;
  try {
    goResponse = await fetch(`${goServiceUrl}/pipeline/upload`, {
      method: 'POST',
      headers: {
        'x-user-id': appUserId,
        'x-max-sessions': process.env.MAX_SESSIONS_PER_USER ?? '10',
      },
      body: goForm,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return sseErrorResponse(`Pipeline service unreachable: ${detail}`);
  }

  if (!goResponse.ok || !goResponse.body) {
    const upstreamText = await goResponse.text().catch(() => '');
    return sseErrorResponse(
      upstreamText
        ? `Pipeline service returned ${goResponse.status}: ${upstreamText}`
        : `Pipeline service returned ${goResponse.status}.`,
    );
  }

  // ── 5. Stream SSE back, intercepting session_created for dedup record ──
  // Closure variables (not `this`) keep TS happy without custom Transformer typing.
  let scanBuffer = '';
  let recorded = false;
  const decoder = new TextDecoder();

  const tee = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Always pass bytes through unchanged.
      controller.enqueue(chunk);

      if (recorded) return;
      scanBuffer += decoder.decode(chunk, { stream: true });

      // Scan complete events ("data: ...\n\n"). One-shot — once we see
      // session_created, stop scanning to keep the stream cheap.
      let idx;
      while ((idx = scanBuffer.indexOf('\n\n')) !== -1) {
        const raw = scanBuffer.slice(0, idx).trim();
        scanBuffer = scanBuffer.slice(idx + 2);
        if (!raw.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(raw.slice(6)) as { type?: string; sessionId?: string };
          if (evt.type === 'session_created' && evt.sessionId) {
            recorded = true;
            // Fire-and-forget; don't block the byte stream.
            recordImportedSession(importSource, sourceId, evt.sessionId).catch((err) =>
              console.error('[import/notesportal] recordImportedSession failed', err),
            );
            break;
          }
        } catch {
          /* malformed event — ignore */
        }
      }
    },
  });

  return new Response(goResponse.body.pipeThrough(tee), { headers: SSE_HEADERS });
}
