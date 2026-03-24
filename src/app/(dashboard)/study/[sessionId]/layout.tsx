/**
 * WHY: Shared layout for all study views (mindmap, chat, flashcards).
 *
 * Renders a 48px sticky navigation strip immediately below the dashboard header
 * that gives the student persistent access to:
 *   - Session title (truncated) and subject domain badge
 *   - Tab links: Mindmap | Flashcards (Chat is reached from the mindmap)
 *   - Learning mode indicator (Fast / Steady)
 *   - Back-to-Dashboard link
 *
 * The nav is sticky at `top: 52px` (dashboard header height) so it stays visible
 * during scroll in the chat and flashcard views. The mindmap page accounts for
 * this additional 48px when computing its viewport-filling height.
 *
 * Auth: The parent (dashboard) layout has already verified the session. Here we
 * re-read the session for the user_id needed to verify session ownership, and
 * return notFound() if the session doesn't belong to this user.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { StudyTabs } from '@/components/study/StudyTabs';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Height in px — must match the hardcoded offset in mindmap/page.tsx */
export const SESSION_NAV_HEIGHT = 48;

// ── Layout ────────────────────────────────────────────────────────────────────

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}

export default async function StudySessionLayout({ children, params }: LayoutProps) {
  const { sessionId } = await params;

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect('/login');
  const appUserId = await resolveAppUserId(authSession.user);

  const supabase = createServerClient();

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('title, learning_mode, subject_domain')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) notFound();

  const { title, learning_mode: mode, subject_domain: domain } = sessionRow;

  return (
    <div>
      {/* ── Session navigation strip ─────────────────────────────────────── */}
      <nav
        className="app-fade-up"
        style={{
          position: 'sticky',
          top: 52, // dashboard header height
          zIndex: 40,
          height: SESSION_NAV_HEIGHT,
          marginTop: -40, // counteract dashboard main's 40px padding-top to sit flush under header
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'color-mix(in srgb, var(--nav-bg) 84%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--primary) 16%, var(--nav-border))',
          backdropFilter: 'blur(9px)',
          marginLeft: -24,
          marginRight: -24,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Left: back link + session title + domain */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              flexShrink: 0,
              letterSpacing: '0.01em',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            ←
          </Link>

          <span
            style={{
              display: 'inline-block',
              width: 1,
              height: 12,
              background: 'var(--border)',
              flexShrink: 0,
            }}
          />

          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {title}
          </span>

          {domain && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                flexShrink: 0,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              }}
            >
              {domain}
            </span>
          )}
        </div>

        {/* Centre: tab navigation — client component reads pathname for active state */}
        <StudyTabs sessionId={sessionId} />

        {/* Right: mode badge */}
        <div style={{ flexShrink: 0, flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mode === 'fast' ? '#C2692A' : '#3D7A5E',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            }}
          >
            {mode === 'fast' ? '⚡ Fast' : '◎ Steady'}
          </span>
        </div>
      </nav>

      {children}
    </div>
  );
}

