/**
 * Accept a share link and redirect to the shared session's mindmap.
 *
 * Flow:
 *   1. Auth required (middleware redirects to /login if unauthenticated)
 *   2. Look up the share code → find the session
 *   3. If the user is the owner, skip share creation
 *   4. Otherwise, create a session_shares row + bootstrap understanding_state
 *   5. Redirect to the mindmap
 */

import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function AcceptSharePage({ params }: PageProps) {
  const { code } = await params;

  // Auth check — middleware should enforce this, but double-check
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect('/login');
  const appUserId = await resolveAppUserId(authSession.user);

  const supabase = createServerClient();

  // Look up the share link
  const { data: shareLink } = await supabase
    .from('share_links')
    .select('session_id, created_by')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (!shareLink) notFound();

  const { session_id: sessionId, created_by: ownerId } = shareLink;

  // If the user is the owner, just redirect — no share record needed
  if (ownerId === appUserId) {
    redirect(`/study/${sessionId}/mindmap`);
  }

  // Create the share record (idempotent via UNIQUE constraint)
  await supabase
    .from('session_shares')
    .upsert(
      {
        session_id: sessionId,
        user_id: appUserId,
        shared_by: ownerId,
      },
      { onConflict: 'session_id,user_id' },
    );

  // Bootstrap understanding_state for the new user:
  // insert a row per concept with confidence_score=0
  const { data: concepts } = await supabase
    .from('concepts')
    .select('id')
    .eq('session_id', sessionId);

  if (concepts?.length) {
    const rows = concepts.map((c) => ({
      session_id: sessionId,
      concept_id: c.id,
      user_id: appUserId,
      confidence_score: 0,
      exposure_count: 0,
    }));

    // Batch insert — skip duplicates if already bootstrapped.
    // Uses the unique index idx_understanding_user_session_concept(session_id, concept_id, user_id).
    await supabase
      .from('understanding_state')
      .upsert(rows, { onConflict: 'session_id,concept_id,user_id', ignoreDuplicates: true });
  }

  redirect(`/study/${sessionId}/mindmap`);
}
