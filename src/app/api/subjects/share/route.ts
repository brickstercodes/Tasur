/**
 * Subject share link management.
 *
 * POST   /api/subjects/share — generate (or return existing) share link for a subject
 * DELETE /api/subjects/share — revoke active link so owner can regenerate a fresh snapshot
 *
 * Both endpoints are owner-only. The session_ids array is a static snapshot of
 * the owner's sessions in that subject at generation time.
 */

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: Request) {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const appUserId = await resolveAppUserId(authSession.user);

  const body = await req.json().catch(() => ({}));
  const subjectName: string = body.subjectName?.trim();
  if (!subjectName) return Response.json({ error: 'Missing subjectName' }, { status: 400 });

  const supabase = createServerClient();

  // Return existing active link for this (owner, subject) if one exists
  const { data: existing } = await supabase
    .from('subject_share_links')
    .select('code')
    .eq('created_by', appUserId)
    .eq('subject_name', subjectName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (existing) return Response.json({ code: existing.code });

  // Snapshot all owned active sessions under this subject
  const { data: sessions } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', appUserId)
    .eq('subject_domain', subjectName)
    .eq('status', 'active');

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) {
    return Response.json({ error: 'No active sessions found for this subject' }, { status: 400 });
  }

  const code = crypto.randomBytes(9).toString('base64url');

  const { error } = await supabase.from('subject_share_links').insert({
    created_by: appUserId,
    code,
    subject_name: subjectName,
    session_ids: sessionIds,
  });

  if (error) return Response.json({ error: 'Failed to create share link' }, { status: 500 });

  return Response.json({ code, sessionCount: sessionIds.length });
}

export async function DELETE(req: Request) {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const appUserId = await resolveAppUserId(authSession.user);

  const body = await req.json().catch(() => ({}));
  const code: string = body.code?.trim();
  if (!code) return Response.json({ error: 'Missing code' }, { status: 400 });

  const supabase = createServerClient();

  await supabase
    .from('subject_share_links')
    .update({ is_active: false })
    .eq('code', code)
    .eq('created_by', appUserId)
    .eq('is_active', true);

  return new Response(null, { status: 204 });
}
