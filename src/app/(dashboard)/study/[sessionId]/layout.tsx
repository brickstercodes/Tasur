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
        style={{
          position: 'sticky',
          top: 52, // dashboard header height
          zIndex: 40,
          height: SESSION_NAV_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          // Escape the dashboard layout's horizontal padding so the nav is full-width
          marginLeft: -24,
          marginRight: -24,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Left: back link + session title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', flexShrink: 0 }}
          >
            ← Dashboard
          </Link>

          <span style={{ color: '#e2e8f0', fontSize: 12 }}>|</span>

          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 220,
            }}
          >
            {title}
          </span>

          {domain && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#6366f1',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                flexShrink: 0,
              }}
            >
              {domain}
            </span>
          )}
        </div>

        {/* Centre: tab navigation */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <TabLink href={`/study/${sessionId}/mindmap`} label="Mindmap" />
          <TabLink href={`/study/${sessionId}/flashcards`} label="Flashcards" />
        </div>

        {/* Right: mode badge */}
        <div style={{ flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mode === 'fast' ? '#E6550D' : '#1A9641',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
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

// ── Tab link ──────────────────────────────────────────────────────────────────

function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: '#475569',
        textDecoration: 'none',
        borderRadius: 6,
        border: '1px solid #e2e8f0',
        background: 'white',
        transition: 'all 0.1s ease',
      }}
    >
      {label}
    </Link>
  );
}
