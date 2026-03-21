/**
 * WHY: REST endpoint for the current user's study session list.
 *
 * GET /api/sessions — returns all sessions owned by the authenticated user,
 * with per-session progress stats (total concepts, mastered, average confidence)
 * aggregated from the understanding_state table. Used by the dashboard to render
 * the session list without an additional per-session round-trip.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { getSessionsForUser } from '@/lib/session-persistence';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const appUserId = await resolveAppUserId(session.user);
    const sessions = await getSessionsForUser(appUserId);
    return Response.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sessions';
    return Response.json({ error: message }, { status: 500 });
  }
}
