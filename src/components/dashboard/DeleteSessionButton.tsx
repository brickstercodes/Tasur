/**
 * WHY: Client component for the session delete action on the dashboard.
 *
 * Extracted as a client component because it needs a click handler and
 * an optimistic confirmation dialog. The parent (dashboard/page.tsx) is a
 * server component so event handlers can't live there.
 *
 * Calls DELETE /api/sessions/[id] then reloads the page to refresh the list.
 * A native window.confirm is used for the confirmation step — lightweight
 * and sufficient for v0.1 without adding a modal library dependency.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteSessionButtonProps {
  sessionId: string;
}

export function DeleteSessionButton({ sessionId }: DeleteSessionButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Delete this session? All concepts, flashcards, and progress will be lost.')) {
      return;
    }

    setDeleting(true);
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes deleteGlowPulse {
          0% {
            filter: drop-shadow(0 0 0 rgba(255, 48, 48, 0));
            transform: translateY(0);
          }
          50% {
            filter: drop-shadow(0 0 9px rgba(255, 36, 36, 0.96));
            transform: translateY(-1px);
          }
          100% {
            filter: drop-shadow(0 0 0 rgba(255, 48, 48, 0));
            transform: translateY(0);
          }
        }

        .delete-session-btn {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, #ef4444 30%, var(--border));
          border-radius: 8px;
          background: var(--surface);
          color: #ef4444;
          cursor: pointer;
          transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
        }

        .delete-session-btn:hover:not(:disabled) {
          color: #ff1f1f;
          border-color: color-mix(in srgb, #ff1f1f 58%, var(--border));
          background: color-mix(in srgb, #ff1f1f 8%, var(--surface));
        }

        .delete-session-btn:hover:not(:disabled) .delete-session-icon {
          animation: deleteGlowPulse 0.85s ease-in-out infinite;
        }

        .delete-session-btn:disabled {
          color: var(--text-muted);
          cursor: not-allowed;
        }
      `}</style>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="delete-session-btn"
        aria-label={deleting ? 'Deleting session' : 'Delete session'}
        title={deleting ? 'Deleting...' : 'Delete session'}
      >
        {deleting ? (
          <span style={{ fontSize: 14, lineHeight: 1 }}>...</span>
        ) : (
          <svg
            className="delete-session-icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        )}
      </button>
    </>
  );
}
