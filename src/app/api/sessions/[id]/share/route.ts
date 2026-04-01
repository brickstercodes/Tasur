/**
 * Share link management for a study session.
 *
 * POST   /api/sessions/[id]/share — generate (or return existing) share link
 * DELETE /api/sessions/[id]/share — revoke the active share link
 *
 * Both endpoints are owner-only.
 */

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Verify ownership
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Return existing active link if one exists
  const { data: existing } = await supabase
    .from('share_links')
    .select('code')
    .eq('session_id', id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return Response.json({ code: existing.code });
  }

  // Generate a new share code
  const code = crypto.randomBytes(9).toString('base64url');

  const { error } = await supabase.from('share_links').insert({
    session_id: id,
    created_by: appUserId,
    code,
  });

  if (error) {
    return Response.json({ error: 'Failed to create share link' }, { status: 500 });
  }

  return Response.json({ code });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Verify ownership
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  await supabase
    .from('share_links')
    .update({ is_active: false })
    .eq('session_id', id)
    .eq('is_active', true);

  return new Response(null, { status: 204 });
}
