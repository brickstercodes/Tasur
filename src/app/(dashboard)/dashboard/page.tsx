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
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
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
              fontSize: 22,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            }}
          >
            {isUploadMode ? (addToSessionId ? 'Add Document' : 'New Session') : 'Your Sessions'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              background: '#6366f1',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            }}
          >
            + New session
          </Link>
        )}
      </div>

      {/* ── Upload flow ──────────────────────────────────────────────────── */}
      {isUploadMode && (
        <div
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
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
              style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}
            >
              ← Back to sessions
            </Link>
          </div>
        </div>
      )}

      {/* ── Session list ─────────────────────────────────────────────────── */}
      {!isUploadMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Left: session info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Link
            href={`/study/${session.id}/mindmap`}
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#0f172a',
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.title}
          </Link>

          {session.domain && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#6366f1',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              {session.domain}
            </span>
          )}

          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: session.mode === 'fast' ? '#E6550D' : '#1A9641',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {session.mode === 'fast' ? '⚡ Fast' : '◎ Steady'}
          </span>
        </div>

        {/* Progress bar + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session.totalConcepts > 0 ? (
            <>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: '#e2e8f0',
                  borderRadius: 2,
                  overflow: 'hidden',
                  maxWidth: 180,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${masteryPercent}%`,
                    background: masteryPercent >= 80 ? '#22c55e' : masteryPercent >= 40 ? '#f59e0b' : '#6366f1',
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                {session.masteredConcepts}/{session.totalConcepts} concepts · {lastActive}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Processing… · {lastActive}
            </span>
          )}
        </div>
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Link
          href={`/dashboard?upload=1&sessionId=${session.id}`}
          style={actionLinkStyle}
        >
          + Doc
        </Link>

        <Link
          href={`/study/${session.id}/mindmap`}
          style={{ ...actionLinkStyle, background: '#6366f1', color: 'white', border: '1px solid #6366f1' }}
        >
          Resume
        </Link>

        <DeleteSessionButton sessionId={session.id} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '60px 24px',
        background: 'white',
        border: '1px dashed #e2e8f0',
        borderRadius: 12,
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      <p style={{ fontSize: 36, margin: '0 0 12px' }}>🧠</p>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>
        No sessions yet
      </p>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
        Upload your first set of notes to generate an interactive study mindmap.
      </p>
      <Link
        href="/dashboard?upload=1"
        style={{
          display: 'inline-flex',
          padding: '9px 20px',
          background: '#6366f1',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Upload notes
      </Link>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const actionLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  textDecoration: 'none',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: 'white',
  fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
};

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
