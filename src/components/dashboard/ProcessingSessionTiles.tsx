/**
 * WHY: Client component that renders placeholder tiles for sessions being
 * processed in the background. Subscribes to the upload-store singleton
 * so it re-renders as SSE progress events arrive.
 *
 * Displayed at the top of the session list on the dashboard. When an upload
 * finishes (status='done'), the store auto-removes the entry after a brief
 * delay and this component triggers a router.refresh() so the server-rendered
 * session list picks up the newly-active session.
 */

'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  getActiveUploads,
  subscribe,
  EMPTY_UPLOADS,
  type ActiveUpload,
} from '@/lib/upload-store';

// ── Store hook ───────────────────────────────────────────────────────────────

function useActiveUploads(): ActiveUpload[] {
  return useSyncExternalStore(
    subscribe,
    getActiveUploads,
    () => EMPTY_UPLOADS, // same reference as initial snapshot
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProcessingSessionTiles() {
  const uploads = useActiveUploads();
  const router = useRouter();

  // When an upload finishes, refresh the page so the server-rendered list updates
  useEffect(() => {
    const done = uploads.filter((u) => u.status === 'done');
    if (done.length > 0) {
      // Small delay so the "Done!" state is briefly visible
      const timer = setTimeout(() => router.refresh(), 1200);
      return () => clearTimeout(timer);
    }
  }, [uploads, router]);

  if (uploads.length === 0) return null;

  return (
    <>
      {uploads.map((upload) => (
        <ProcessingTile key={upload.sessionId} upload={upload} />
      ))}
    </>
  );
}

// ── Tile ─────────────────────────────────────────────────────────────────────

function ProcessingTile({ upload }: { upload: ActiveUpload }) {
  const isError = upload.status === 'error';
  const isDone = upload.status === 'done';

  return (
    <div
      className="session-card manuscript-card"
      style={{
        position: 'relative',
        padding: '20px 24px',
        borderRadius: 10,
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden',
        opacity: isError ? 0.7 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Left: info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              display: 'block',
              fontSize: 20,
              fontWeight: 400,
              color: 'var(--text)',
              fontFamily: "'Instrument Serif', Georgia, serif",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
              marginBottom: 6,
            }}
          >
            {upload.title}
          </p>

          {/* Domain + mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {upload.domain && (
              <span
                style={{
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                {upload.domain}
              </span>
            )}
            {upload.domain && (
              <span style={{ color: 'var(--border)', fontSize: 12 }}>·</span>
            )}
            <span
              style={{
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: upload.mode === 'fast' ? '#C2692A' : '#3D7A5E',
              }}
            >
              {upload.mode === 'fast' ? 'Fast' : 'Steady'}
            </span>
          </div>

          {/* Status line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isError && !isDone && (
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--primary)',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ fontSize: 12, color: isError ? '#C25858' : 'var(--text-muted)' }}>
              {isError
                ? upload.errorMessage || 'Something went wrong'
                : isDone
                ? 'Ready!'
                : upload.label || 'Processing...'}
            </span>
          </div>
        </div>

        {/* Right: progress indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            minWidth: 116,
            minHeight: 36,
          }}
        >
          {!isError && (
            <span
              style={{
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
              }}
            >
              {upload.percent}%
            </span>
          )}
        </div>
      </div>

      {/* Progress bar at bottom */}
      {!isError && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--border)',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${upload.percent}%`,
              background: isDone ? '#3D7A5E' : 'var(--primary)',
              transition: 'width 0.4s ease',
              borderRadius: '0 0 10px 10px',
            }}
          />
        </div>
      )}

      {/* Error accent */}
      {isError && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: '#C25858',
            borderRadius: '0 0 10px 10px',
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
