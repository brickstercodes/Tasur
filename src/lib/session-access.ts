/**
 * Shared helper to check whether a user has access to a study session —
 * either as the owner or via a share link they previously accepted.
 */

import { createServerClient } from '@/lib/supabase';

export interface SessionAccess {
  sessionId: string;
  appUserId: string;
  isOwner: boolean;
  session: {
    title: string;
    learning_mode: string;
    subject_domain: string | null;
    user_id: string;
  };
}

/**
 * Returns access info if the user owns or has been shared the session,
 * or null if they have no access.
 */
export async function resolveSessionAccess(
  sessionId: string,
  appUserId: string,
): Promise<SessionAccess | null> {
  const supabase = createServerClient();

  // Fast path: user owns the session
  const { data: ownedSession } = await supabase
    .from('study_sessions')
    .select('title, learning_mode, subject_domain, user_id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (ownedSession) {
    return {
      sessionId,
      appUserId,
      isOwner: true,
      session: ownedSession,
    };
  }

  // Check if the user has been shared this session
  // Gracefully handles missing table (migration not yet applied)
  try {
    const { data: share, error: shareError } = await supabase
      .from('session_shares')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', appUserId)
      .limit(1)
      .maybeSingle();

    if (shareError || !share) return null;
  } catch {
    return null;
  }

  // Fetch the session without the user_id filter
  const { data: sharedSession } = await supabase
    .from('study_sessions')
    .select('title, learning_mode, subject_domain, user_id')
    .eq('id', sessionId)
    .single();

  if (!sharedSession) return null;

  return {
    sessionId,
    appUserId,
    isOwner: false,
    session: sharedSession,
  };
}
