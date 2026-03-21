/**
 * WHY: Server component for the Phase 2 conversational study interface.
 *
 * Reached via `/study/[sessionId]/chat?conceptId=<id>` — the MindmapViewer
 * pushes students here when they click a concept node.
 *
 * This page:
 *   1. Validates auth + session ownership (guard before any DB queries).
 *   2. Fetches the concept name and session metadata in parallel.
 *   3. Renders a breadcrumb and concept header so students always know
 *      where they are in the learning flow.
 *   4. Mounts the ChatInterface client component with everything it needs
 *      to operate without additional server round-trips.
 *
 * Missing conceptId or a concept that doesn't belong to the session both
 * return 404 — guards against URL manipulation.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { ChatInterface } from '@/components/chat/ChatInterface';

// ── Page props ────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ conceptId?: string }>;
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function ChatPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const { conceptId } = await searchParams;

  if (!conceptId) {
    notFound();
  }

  // Auth gate — layout also guards, but we check here to get the user id
  // for the session ownership query below.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/login');
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Fetch session metadata and concept details in parallel.
  const [sessionResult, conceptResult] = await Promise.all([
    supabase
      .from('study_sessions')
      .select('title, learning_mode, subject_domain, user_id')
      .eq('id', sessionId)
      .eq('user_id', appUserId)
      .single(),

    supabase
      .from('concepts')
      .select('id, name')
      .eq('id', conceptId)
      .eq('session_id', sessionId)
      .single(),
  ]);

  if (sessionResult.error || !sessionResult.data) {
    notFound();
  }

  if (conceptResult.error || !conceptResult.data) {
    notFound();
  }

  const { title: sessionTitle, learning_mode: learningMode, subject_domain } = sessionResult.data;
  const { name: conceptName } = conceptResult.data;
  const domain = subject_domain ?? 'general';

  return (
    /*
     * The dashboard layout applies max-w-5xl + px-6 py-10 to <main>.
     * We keep that constraint for the chat page (unlike mindmap which
     * needs full viewport) so the conversation feels focused and readable.
     */
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 112px)', // viewport minus dashboard header + main padding
      }}
    >
      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: '#94a3b8',
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <Link
          href="/dashboard"
          style={{ color: '#94a3b8', textDecoration: 'none' }}
        >
          Dashboard
        </Link>
        <span>›</span>
        <Link
          href={`/study/${sessionId}/mindmap`}
          style={{ color: '#94a3b8', textDecoration: 'none' }}
        >
          {sessionTitle}
        </Link>
        <span>›</span>
        <span style={{ color: '#475569', fontWeight: 500 }}>{conceptName}</span>
      </nav>

      {/* ── Concept header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexShrink: 0,
          paddingBottom: 14,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            }}
          >
            {conceptName}
          </h1>
          {subject_domain && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 4,
                fontSize: 11,
                fontWeight: 600,
                color: '#6366f1',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {domain}
            </span>
          )}
        </div>

        {/* Learning mode + back link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: learningMode === 'fast' ? '#E6550D' : '#1A9641',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {learningMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
          </span>

          <Link
            href={`/study/${sessionId}/mindmap`}
            style={{
              fontSize: 12,
              color: '#6366f1',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '4px 10px',
              border: '1px solid #c7d2fe',
              borderRadius: 6,
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            }}
          >
            ← Mindmap
          </Link>
        </div>
      </div>

      {/* ── Chat interface ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatInterface
          sessionId={sessionId}
          conceptId={conceptId}
          conceptName={conceptName}
          domain={domain}
          learningMode={learningMode}
        />
      </div>
    </div>
  );
}
