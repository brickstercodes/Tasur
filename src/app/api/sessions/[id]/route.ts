/**
 * WHY: Per-session REST endpoints for retrieval and deletion.
 *
 * GET  /api/sessions/[id] — returns session metadata + progress for the
 *   resume flow. Verifies ownership before returning data.
 *
 * DELETE /api/sessions/[id] — hard-deletes the session row. Supabase's
 *   CASCADE constraints propagate the delete to all child tables:
 *   concepts, concept_relationships, flashcards, understanding_state,
 *   mindmaps, documents, chat_messages.
 *
 * Both handlers enforce session ownership: a user may only read or delete
 * sessions they created.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  const { data: sessionRow, error } = await supabase
    .from('study_sessions')
    .select('id, title, subject_domain, learning_mode, status, created_at, last_active_at')
    .eq('id', id)
    .eq('user_id', appUserId)
    .single();

  if (error || !sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch progress stats for the resume card
  const { data: understandingRows } = await supabase
    .from('understanding_state')
    .select('concept_id, confidence_score')
    .eq('session_id', id);

  const scores = (understandingRows ?? []).map((r) => r.confidence_score);
  const total = scores.length;
  const mastered = scores.filter((s) => s >= 0.6).length;
  const averageConfidence = total > 0 ? scores.reduce((a, b) => a + b, 0) / total : 0;

  return Response.json({
    session: {
      ...sessionRow,
      progress: { total, mastered, averageConfidence },
    },
  });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Verify ownership before deleting — prevents cross-user deletion
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('study_sessions')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: 'Failed to delete session' }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
