/**
 * WHY: Return a short-lived signed URL for the session's PDF document.
 * Used by diagram previews to refresh expired links for shared viewers.
 */

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { resolveSessionAccess } from '@/lib/session-access';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const access = await resolveSessionAccess(sessionId, appUserId);
  if (!access) {
    return new Response('Not found', { status: 404 });
  }

  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('file_path, file_type')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return new Response('No document found', { status: 404 });
  }

  const filePath = doc.file_path ?? '';
  const fileType = doc.file_type ?? '';
  const isPdf = fileType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf');

  if (!isPdf || !filePath || !filePath.includes('/')) {
    return new Response('Document is not a PDF', { status: 422 });
  }

  try {
    const { data: signedUrlData } = await supabase.storage
      .from('tasur-documents')
      .createSignedUrl(filePath, 3600);

    if (!signedUrlData?.signedUrl) {
      return new Response('Unable to sign URL', { status: 502 });
    }

    const fileName = filePath.includes('/') ? filePath.split('/').pop() : filePath;
    return Response.json({ signedUrl: signedUrlData.signedUrl, fileName, fileType });
  } catch {
    return new Response('Failed to sign URL', { status: 502 });
  }
}
