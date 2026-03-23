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
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: deleting ? 'var(--text-muted)' : '#ef4444',
        border: '1px solid color-mix(in srgb, #ef4444 30%, var(--border))',
        borderRadius: 6,
        background: 'var(--surface)',
        cursor: deleting ? 'not-allowed' : 'pointer',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {deleting ? '…' : 'Delete'}
    </button>
  );
}
