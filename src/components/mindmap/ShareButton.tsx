'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ShareButtonProps {
  sessionId: string;
}

export function ShareButton({ sessionId }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const generateLink = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      setShareCode(data.code);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const opening = !prev;
      if (opening && !shareCode) {
        generateLink();
      }
      return opening;
    });
  }, [shareCode, generateLink]);

  const handleCopy = useCallback(async () => {
    if (!shareCode) return;
    const url = `${window.location.origin}/share/${shareCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareCode]);

  // Close popover on outside click
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
    <div ref={popoverRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={handleToggle}
        title="Share session"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          borderRadius: 999,
          border: isOpen
            ? '1px solid var(--primary)'
            : '1px solid var(--toolbar-border)',
          background: isOpen
            ? 'color-mix(in srgb, var(--primary) 12%, var(--toolbar-bg))'
            : 'transparent',
          color: 'var(--text)',
          padding: '7px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
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
            zIndex: 100,
            minWidth: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {loading ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Generating link...
            </span>
          ) : shareCode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Share link
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareCode}`}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '8px 10px',
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
                    minHeight: 34,
                    padding: '0 14px',
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
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Anyone with this link and a Tasur account can view this session.
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Failed to generate link.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
