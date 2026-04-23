/**
 * Claim selected sessions from a subject share link.
 *
 * POST /api/subjects/claim/[code]
 *   Body: { sessionIds: string[] } — the subset the recipient chose to accept
 *
 * For each session: upserts session_shares + bootstraps understanding_state.
 * Only processes sessions that are actually in the link's snapshot (safety check).
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { code } = await params;

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const appUserId = await resolveAppUserId(authSession.user);

  const body = await req.json().catch(() => ({}));
  const chosenIds: string[] = Array.isArray(body.sessionIds) ? body.sessionIds : [];

  const supabase = createServerClient();

  // Load the share link and verify it's active
  const { data: shareLink } = await supabase
    .from('subject_share_links')
    .select('created_by, session_ids')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (!shareLink) return Response.json({ error: 'Share link not found' }, { status: 404 });

  const ownerId: string = shareLink.created_by;
  const snapshotIds: string[] = shareLink.session_ids;

  // Only process sessions that are actually in the snapshot (prevents spoofing)
  const safeIds = chosenIds.filter((id) => snapshotIds.includes(id));
  if (safeIds.length === 0) return Response.json({ ok: true, added: 0 });

  for (const sessionId of safeIds) {
    // Upsert session_shares — skip if already shared
    await supabase.from('session_shares').upsert(
      { session_id: sessionId, user_id: appUserId, shared_by: ownerId },
      { onConflict: 'session_id,user_id' },
    );

    // Bootstrap understanding_state — skip existing rows (preserves any prior progress)
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
      await supabase
        .from('understanding_state')
        .upsert(rows, { onConflict: 'session_id,concept_id,user_id', ignoreDuplicates: true });
    }
  }

  return Response.json({ ok: true, added: safeIds.length });
}
