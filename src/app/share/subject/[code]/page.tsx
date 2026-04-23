/**
 * Subject share claim page.
 *
 * Shows a preview of incoming sessions categorised as:
 *   - new      — not in the recipient's account at all
 *   - exact    — same session_id already shared/owned → auto-skipped
 *   - conflict — different session with same (title + subject_domain) → user chooses
 *
 * Hands off to SubjectShareClaimUI for interactive resolution.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { SubjectShareClaimUI, type SessionClaimItem } from '@/components/share/SubjectShareClaimUI';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function SubjectShareClaimPage({ params }: PageProps) {
  const { code } = await params;

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect('/login');
  const appUserId = await resolveAppUserId(authSession.user);

  const supabase = createServerClient();

  // Load the share link
  const { data: shareLink } = await supabase
    .from('subject_share_links')
    .select('created_by, subject_name, session_ids')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (!shareLink) notFound();

  const { created_by: ownerId, subject_name: subjectName, session_ids: sessionIds } = shareLink;

  // Owner opening their own link → just go to dashboard
  if (ownerId === appUserId) redirect('/dashboard');

  // Fetch metadata for all sessions in the snapshot
  const { data: sessionRows } = await supabase
    .from('study_sessions')
    .select('id, title, subject_domain')
    .in('id', sessionIds);

  // Count concepts per session for the preview
  const { data: conceptRows } = await supabase
    .from('concepts')
    .select('session_id')
    .in('session_id', sessionIds);

  const conceptCountMap: Record<string, number> = {};
  for (const row of conceptRows ?? []) {
    conceptCountMap[row.session_id] = (conceptCountMap[row.session_id] ?? 0) + 1;
  }

  // Load recipient's existing session_shares (exact same session_ids)
  const { data: existingShares } = await supabase
    .from('session_shares')
    .select('session_id')
    .eq('user_id', appUserId)
    .in('session_id', sessionIds);

  const exactShareIds = new Set((existingShares ?? []).map((r) => r.session_id));

  // Load recipient's owned sessions to detect title+subject conflicts
  const { data: ownedSessions } = await supabase
    .from('study_sessions')
    .select('title, subject_domain')
    .eq('user_id', appUserId);

  // Build a set of "title||subject_domain" keys the recipient already owns
  const ownedKeys = new Set(
    (ownedSessions ?? []).map((s) => `${s.title.trim().toLowerCase()}||${(s.subject_domain ?? '').trim().toLowerCase()}`),
  );

  // Categorise each incoming session
  const items: SessionClaimItem[] = (sessionRows ?? []).map((s) => {
    if (exactShareIds.has(s.id)) {
      return { sessionId: s.id, title: s.title, subjectDomain: s.subject_domain ?? '', conceptCount: conceptCountMap[s.id] ?? 0, status: 'exact' };
    }
    const key = `${s.title.trim().toLowerCase()}||${(s.subject_domain ?? '').trim().toLowerCase()}`;
    if (ownedKeys.has(key)) {
      return { sessionId: s.id, title: s.title, subjectDomain: s.subject_domain ?? '', conceptCount: conceptCountMap[s.id] ?? 0, status: 'conflict' };
    }
    return { sessionId: s.id, title: s.title, subjectDomain: s.subject_domain ?? '', conceptCount: conceptCountMap[s.id] ?? 0, status: 'new' };
  });

  return (
    <SubjectShareClaimUI
      code={code}
      subjectName={subjectName}
      items={items}
    />
  );
}
