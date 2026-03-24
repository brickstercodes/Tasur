/**
 * WHY: Main dashboard — the student's home screen after sign-in.
 *
 * Two states:
 *   1. SESSION LIST — renders all past study sessions with per-session progress
 *      stats (concepts mastered, last active) and action buttons (Resume, Delete,
 *      Add Document). Each session card links to its mindmap.
 *
 *   2. UPLOAD FLOW — shown when the student clicks "New session". Mounts the
 *      UploadFlow client component (file drop + settings + SSE progress).
 *      Uses a query param (?upload=1) so the state survives page refresh
 *      and the browser back button returns to the session list.
 *
 * Session data is fetched server-side on every render so the list is always fresh.
 * The progress stats (mastered / total) come from understanding_state confidence
 * scores aggregated in getSessionsForUser().
 *
 * Add-document mode: clicking "Add Doc" on a session navigates to
 * ?upload=1&sessionId=<id>, which renders UploadFlow with existingSessionId set.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { getSessionsForUser, type SessionListItem } from '@/lib/session-persistence';
import { UploadFlow } from '@/components/upload/UploadFlow';
import { DeleteSessionButton } from '@/components/dashboard/DeleteSessionButton';

// ── Page props ────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ upload?: string; sessionId?: string }>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: PageProps) {
  const { upload, sessionId: addToSessionId } = await searchParams;

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect('/login');

  const appUserId = await resolveAppUserId(authSession.user);
  const sessions = await getSessionsForUser(appUserId);

  const isUploadMode = upload === '1';

  return (
    <div className="app-fade-up" style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="manuscript-heading"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 400,
              color: 'var(--text)',
              fontFamily: "'Instrument Serif', Georgia, serif",
            }}
          >
            {isUploadMode ? (addToSessionId ? 'Add Document' : 'New Session') : 'Sessions'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {isUploadMode
              ? 'Upload your notes and let Tasur build your study experience.'
              : sessions.length === 0
              ? 'No sessions yet. Upload your first set of notes to get started.'
              : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {!isUploadMode && (
          <Link
            href="/dashboard?upload=1"
            className="manuscript-button"
            style={{
              fontFamily: 'Inter, sans-serif',
            }}
          >
            New session +
          </Link>
        )}
      </div>

      {/* ── Upload flow ──────────────────────────────────────────────────── */}
      {isUploadMode && (
        <div
          className="manuscript-card app-fade-up"
          style={{
            borderRadius: 12,
            padding: '28px 28px',
          }}
        >
          <UploadFlow
            existingSessionId={addToSessionId}
            onCancel={undefined /* back link handled by the browser */}
          />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link
              href="/dashboard"
              style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              ← Back to sessions
            </Link>
          </div>
        </div>
      )}

      {/* ── Session list ─────────────────────────────────────────────────── */}
      {!isUploadMode && (
        <div className="stagger-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.length === 0 ? (
            <EmptyState />
          ) : (
            sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: SessionListItem }) {
  const masteryPercent =
    session.totalConcepts > 0
      ? Math.round((session.masteredConcepts / session.totalConcepts) * 100)
      : 0;

  const lastActive = formatRelativeTime(session.lastActiveAt);

  return (
    <div
      className="session-card manuscript-card"
      style={{
        position: 'relative',
        padding: '20px 24px',
        borderRadius: 10,
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Main content row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Left: session info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/study/${session.id}/mindmap`}
            style={{
              display: 'block',
              fontSize: 20,
              fontWeight: 400,
              color: 'var(--text)',
              textDecoration: 'none',
              fontFamily: "'Instrument Serif', Georgia, serif",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
              marginBottom: 6,
            }}
          >
            {session.title}
          </Link>

          {/* Domain · mode tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {session.domain && (
              <span
                style={{
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                {session.domain}
              </span>
            )}
            {session.domain && (
              <span style={{ color: 'var(--border)', fontSize: 12 }}>·</span>
            )}
            <span
              style={{
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: session.mode === 'fast' ? '#C2692A' : '#3D7A5E',
              }}
            >
              {session.mode === 'fast' ? '⚡ Fast' : '◎ Steady'}
            </span>
          </div>

          {/* Stats line */}
          {session.totalConcepts > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {session.masteredConcepts} of {session.totalConcepts} concepts · {lastActive}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Processing… · {lastActive}
            </span>
          )}
        </div>

        {/* Right: action links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Link
            href={`/dashboard?upload=1&sessionId=${session.id}`}
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            + doc
          </Link>

          <Link
            href={`/study/${session.id}/mindmap`}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--primary)',
              textDecoration: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Resume →
          </Link>

          <DeleteSessionButton sessionId={session.id} />
        </div>
      </div>

      {/* Amber accent line at very bottom of card */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'var(--primary)',
          borderRadius: '0 0 10px 10px',
        }}
      />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="manuscript-card app-fade-up"
      style={{
        textAlign: 'center',
        padding: '60px 24px',
        borderRadius: 12,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--text-faint)',
          margin: '0 0 10px',
        }}
      >
        Your sessions will appear here.
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        Upload your first set of notes to generate an interactive study mindmap.
      </p>
      <Link
        href="/dashboard?upload=1"
        className="manuscript-button"
        style={{
          fontFamily: 'Inter, sans-serif',
        }}
      >
        New session +
      </Link>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 2) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
