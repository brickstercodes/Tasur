'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ShareSubjectButtonProps {
  subjectName: string;
  sessionCount: number;
}

export function ShareSubjectButton({ subjectName, sessionCount }: ShareSubjectButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const generateLink = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/subjects/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName }),
      });
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setShareCode(data.code);
    } finally {
      setLoading(false);
    }
  }, [subjectName]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent <details> from toggling
      setIsOpen((prev) => {
        const opening = !prev;
        if (opening && !shareCode) generateLink();
        return opening;
      });
    },
    [shareCode, generateLink],
  );

  const handleRegenerate = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!shareCode) return;
      // Revoke current link then generate a fresh snapshot
      await fetch('/api/subjects/share', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: shareCode }),
      });
      setShareCode(null);
      generateLink();
    },
    [shareCode, generateLink],
  );

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!shareCode) return;
      const url = `${window.location.origin}/share/subject/${shareCode}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [shareCode],
  );

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div
      ref={popoverRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleToggle}
        title={`Share ${subjectName}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
          background: isOpen
            ? 'color-mix(in srgb, var(--primary) 12%, var(--toolbar-bg))'
            : 'transparent',
          color: isOpen ? 'var(--primary)' : 'var(--text-muted)',
          padding: '3px 10px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        Share
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--toolbar-bg)',
            border: '1px solid var(--toolbar-border)',
            borderRadius: 10,
            padding: '14px 16px',
            zIndex: 200,
            width: 340,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {loading ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generating link…</span>
          ) : error ? (
            <span style={{ fontSize: 12, color: '#c0392b' }}>Failed to generate link.</span>
          ) : shareCode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Share {subjectName} · {sessionCount} session{sessionCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleRegenerate}
                  title="Regenerate link with latest sessions"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Regenerate
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/subject/${shareCode}`}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface, var(--toolbar-bg))',
                    color: 'var(--text)',
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    outline: 'none',
                    minWidth: 0,
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 32,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: copied ? '#3D7A5E' : 'var(--primary)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Static snapshot warning */}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                This link shares the <strong>{sessionCount}</strong> session{sessionCount !== 1 ? 's' : ''} in <em>{subjectName}</em> right now.
                New sessions added later won't be included — hit <strong>Regenerate</strong> to update the link.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
