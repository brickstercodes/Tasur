/**
 * WHY: Auto-provisions the Tasur walkthrough session for every new user.
 *
 * One canonical session (owned by the system account) lives in the DB.
 * On first signup we insert a session_shares row + bootstrap understanding_state
 * — identical to what /share/[code] does when a user accepts an invite.
 * This means:
 *   - No data duplication (concepts, mindmap, flashcards are shared)
 *   - Each user's progress is fully independent (per-user understanding_state)
 *   - Deleting it only removes the session_shares row, not the source data
 */

import { createServerClient } from '@/lib/supabase';

const TUTORIAL_SESSION_ID = process.env.TUTORIAL_SESSION_ID;
const TUTORIAL_SESSION_OWNER_ID = process.env.TUTORIAL_SESSION_OWNER_ID;

export async function provisionTutorialSession(userId: string): Promise<void> {
  if (!TUTORIAL_SESSION_ID || !TUTORIAL_SESSION_OWNER_ID) return;

  // Skip if the user is the system owner — they already own the session.
  if (userId === TUTORIAL_SESSION_OWNER_ID) return;

  const supabase = createServerClient();

  // Idempotent — UNIQUE constraint on (session_id, user_id) makes this safe to call twice.
  await supabase
    .from('session_shares')
    .upsert(
      {
        session_id: TUTORIAL_SESSION_ID,
        user_id: userId,
        shared_by: TUTORIAL_SESSION_OWNER_ID,
      },
      { onConflict: 'session_id,user_id' },
    );

  // Bootstrap understanding_state so the dashboard shows progress bars immediately.
  const { data: concepts } = await supabase
    .from('concepts')
    .select('id')
    .eq('session_id', TUTORIAL_SESSION_ID);

  if (concepts?.length) {
    const rows = concepts.map((c) => ({
      session_id: TUTORIAL_SESSION_ID,
      concept_id: c.id,
      user_id: userId,
      confidence_score: 0,
      exposure_count: 0,
    }));

    await supabase
      .from('understanding_state')
      .upsert(rows, { onConflict: 'session_id,concept_id,user_id', ignoreDuplicates: true });
  }
}
