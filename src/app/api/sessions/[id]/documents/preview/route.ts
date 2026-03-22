/**
 * WHY: Document preview endpoint for the Focus Zone iframe.
 *
 * GET /api/sessions/[id]/documents/preview
 *
 * Two code paths:
 *   1. If the document's file_path includes '/' (i.e. it was stored in Supabase
 *      Storage), we generate a 1-hour signed URL and 302-redirect the iframe to
 *      the raw file. The browser renders the PDF natively.
 *
 *   2. If file_path is just a filename (legacy uploads before Storage was wired
 *      in), we fall back to the raw_text field and return a styled HTML document
 *      that renders in the iframe like a clean reading view.
 *
 * Auth: session ownership is verified before any data is returned.
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // ── Verify session ownership ───────────────────────────────────────────────
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return new Response('Not found', { status: 404 });
  }

  // ── Fetch first document ───────────────────────────────────────────────────
  const { data: doc } = await supabase
    .from('documents')
    .select('file_path, raw_text, file_type')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return new Response('No document found', { status: 404 });
  }

  // ── Path 1: Storage-backed file → redirect to signed URL ──────────────────
  if (doc.file_path && doc.file_path.includes('/')) {
    try {
      const { data: signedUrlData } = await supabase.storage
        .from('tasur-documents')
        .createSignedUrl(doc.file_path, 3600);

      if (signedUrlData?.signedUrl) {
        return NextResponse.redirect(signedUrlData.signedUrl);
      }
    } catch {
      // Fall through to raw_text rendering
    }
  }

  // ── Path 2: Text-only (legacy) → styled HTML reader ───────────────────────
  const rawText = doc.raw_text ?? '';
  const fileName = doc.file_path
    ? (doc.file_path.includes('/') ? doc.file_path.split('/').pop() : doc.file_path)
    : 'Document';

  // Escape HTML special characters in the raw text
  const escapedText = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fileName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #fafaf8;
      color: #2d2a27;
      font-family: 'Georgia', serif;
      font-size: 13.5px;
      line-height: 1.75;
      padding: 32px 28px 48px;
    }

    .doc-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #ECEAE2;
    }

    .doc-filename {
      font-family: 'Courier New', monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #944604;
      margin-bottom: 4px;
    }

    .doc-label {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #A8A29E;
    }

    .doc-body {
      white-space: pre-wrap;
      word-break: break-word;
      color: #3a3633;
    }

    ::selection {
      background: rgba(148, 70, 4, 0.12);
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #ECEAE2; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-filename">${fileName}</div>
    <div class="doc-label">Source Notes</div>
  </div>
  <div class="doc-body">${escapedText}</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      // Allow same-origin iframe embedding
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}
