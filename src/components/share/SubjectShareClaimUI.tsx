'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type SessionClaimItem = {
  sessionId: string;
  title: string;
  subjectDomain: string;
  conceptCount: number;
  status: 'new' | 'exact' | 'conflict';
};

interface Props {
  code: string;
  subjectName: string;
  items: SessionClaimItem[];
}

export function SubjectShareClaimUI({ code, subjectName, items }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // For conflict sessions: track whether user wants to add them (default: skip)
  const [conflictChoices, setConflictChoices] = useState<Record<string, boolean>>(
    Object.fromEntries(items.filter((i) => i.status === 'conflict').map((i) => [i.sessionId, false])),
  );

  const newCount = items.filter((i) => i.status === 'new').length;
  const exactCount = items.filter((i) => i.status === 'exact').length;
  const conflictCount = items.filter((i) => i.status === 'conflict').length;
  const addingConflictCount = Object.values(conflictChoices).filter(Boolean).length;
  const totalAdding = newCount + addingConflictCount;

  function toggleConflict(sessionId: string) {
    setConflictChoices((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  }

  function handleClaim() {
    const toAdd = [
      ...items.filter((i) => i.status === 'new').map((i) => i.sessionId),
      ...items.filter((i) => i.status === 'conflict' && conflictChoices[i.sessionId]).map((i) => i.sessionId),
    ];

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/subjects/claim/${code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionIds: toAdd }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? 'Something went wrong — please try again.');
          return;
        }
        router.push('/dashboard');
      } catch {
        setError('Network error — check your connection and try again.');
      }
    });
  }

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          Shared with you
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 400,
            color: 'var(--text)',
            fontFamily: "'Instrument Serif', Georgia, serif",
          }}
        >
          {subjectName}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          {items.length} session{items.length !== 1 ? 's' : ''} —{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{newCount} new</span>
          {exactCount > 0 && `, ${exactCount} already in your account`}
          {conflictCount > 0 && `, ${conflictCount} with a naming conflict`}
        </p>
      </div>

      {/* Session list */}
      <div
        className="manuscript-card"
        style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}
      >
        {items.map((item, i) => (
          <div
            key={item.sessionId}
            style={{
              padding: '14px 20px',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: item.status === 'exact' ? 0.5 : 1,
            }}
          >
            {/* Status indicator */}
            <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: statusColor(item.status) }} />

            {/* Session info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', fontWeight: 400 }}>
                {item.title}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {item.conceptCount > 0 ? `${item.conceptCount} concepts` : 'Processing…'}
                {item.status === 'exact' && ' · already in your account'}
                {item.status === 'conflict' && ' · you have a session with this name (different source)'}
              </p>
            </div>

            {/* Conflict toggle */}
            {item.status === 'conflict' && (
              <button
                onClick={() => toggleConflict(item.sessionId)}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${conflictChoices[item.sessionId] ? 'var(--primary)' : 'var(--border)'}`,
                  background: conflictChoices[item.sessionId]
                    ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                    : 'transparent',
                  color: conflictChoices[item.sessionId] ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {conflictChoices[item.sessionId] ? 'Add both' : 'Skip'}
              </button>
            )}

            {/* New badge */}
            {item.status === 'new' && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--primary)', letterSpacing: '0.04em' }}>
                NEW
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#c0392b' }}>{error}</p>
      )}

      {/* CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleClaim}
          disabled={isPending || totalAdding === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 40,
            padding: '0 20px',
            borderRadius: 999,
            border: 'none',
            background: totalAdding === 0 ? 'var(--border)' : 'var(--primary)',
            color: totalAdding === 0 ? 'var(--text-muted)' : '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: totalAdding === 0 || isPending ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          {isPending
            ? 'Adding…'
            : totalAdding === 0
            ? 'Nothing to add'
            : `Add ${totalAdding} session${totalAdding !== 1 ? 's' : ''} to my account →`}
        </button>

        <a
          href="/dashboard"
          style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          Maybe later
        </a>
      </div>
    </div>
  );
}

function statusColor(status: SessionClaimItem['status']): string {
  if (status === 'new') return 'var(--primary)';
  if (status === 'conflict') return '#e67e22';
  return 'var(--border)';
}
