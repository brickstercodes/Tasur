'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { getDocFromCache } from '@/lib/doc-cache';

const DEFAULT_FOCUS_ZONE_WIDTH = 340;
const MIN_FOCUS_ZONE_WIDTH = 260;
const MAX_FOCUS_ZONE_WIDTH = 620;

interface FocusZoneProps {
  sessionId: string;
  conceptName: string;
  prerequisites: string[];
  studyCue?: string;
  documentText?: string;
  documentFileName?: string;
  documentUrl?: string;
  documentFileType?: string;
}

const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export function FocusZone({
  sessionId,
  conceptName,
  prerequisites,
  studyCue,
  documentText,
  documentFileName,
  documentUrl,
  documentFileType,
}: FocusZoneProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  const { theme } = useTheme();
  const [blobUrl, setBlobUrl] = useState<string | undefined>();
  const blobRef = useRef<string | undefined>(undefined);
  const panelRef = useRef<HTMLElement | null>(null);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_FOCUS_ZONE_WIDTH);

  // Try to load the original file from the browser's IndexedDB cache first.
  // This lets us render the real PDF without touching server storage.
  useEffect(() => {
    let cancelled = false;
    getDocFromCache(sessionId).then((cached) => {
      if (cancelled || !cached) return;
      const url = URL.createObjectURL(cached.data);
      blobRef.current = url;
      setBlobUrl(url);
    }).catch(() => { /* no cache — fall through to server URL */ });
    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = undefined;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!isResizingRef.current) return;

      // Dragging left increases width (sidebar is anchored to the right side).
      const delta = resizeStartXRef.current - event.clientX;
      const nextWidth = Math.min(
        MAX_FOCUS_ZONE_WIDTH,
        Math.max(MIN_FOCUS_ZONE_WIDTH, resizeStartWidthRef.current + delta),
      );
      setPanelWidth(nextWidth);
    }

    function stopResizing() {
      isResizingRef.current = false;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, []);

  function handleResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const currentWidth = panelRef.current?.offsetWidth ?? DEFAULT_FOCUS_ZONE_WIDTH;
    isResizingRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = currentWidth;
    setPanelWidth(currentWidth);
  }

  // Blob URL takes priority; fall back to server URL.
  // Only append theme param for our own preview API route (not blob: or Supabase URLs).
  const resolvedUrl = blobUrl ?? documentUrl;
  const themedDocumentUrl = resolvedUrl
    ? resolvedUrl.startsWith('/api/')
      ? `${resolvedUrl}?theme=${theme}`
      : resolvedUrl
    : undefined;

  if (isCollapsed) {
    return (
      <aside
        style={{
          width: 44,
          flexShrink: 0,
          borderLeft: '1px solid var(--focus-border)',
          background: 'var(--focus-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
        }}
      >
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: 'var(--text-muted)',
            padding: 8,
          }}
          title="Expand Focus Zone"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <>
      <style>{`
        .focus-zone-scroll::-webkit-scrollbar { width: 4px; }
        .focus-zone-scroll::-webkit-scrollbar-track { background: transparent; }
        .focus-zone-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 10px; }

        @keyframes focus-zone-grip-pulse {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }
      `}</style>
      <aside
        ref={panelRef}
        className="focus-zone-scroll focus-zone-shell"
        style={{
          position: 'relative',
          width: panelWidth === null ? '50%' : `${panelWidth}px`,
          flexShrink: 0,
          borderLeft: '1px solid var(--focus-border)',
          background: 'var(--focus-bg)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Focus Zone"
          title="Drag to resize (double-click to reset)"
          onDoubleClick={() => setPanelWidth(null)}
          onPointerDown={handleResizeStart}
          onMouseEnter={() => setIsHandleHovered(true)}
          onMouseLeave={() => setIsHandleHovered(false)}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 24,
            transform: 'translateX(-50%)',
            cursor: 'col-resize',
            touchAction: 'none',
            userSelect: 'none',
            zIndex: 2,
            background: isHandleHovered
              ? 'color-mix(in srgb, var(--primary) 18%, transparent)'
              : 'transparent',
            transition: 'background 0.18s ease',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 3,
                height: 46,
                borderRadius: 999,
                background: isHandleHovered
                  ? 'var(--primary)'
                  : 'color-mix(in srgb, var(--text-faint) 55%, var(--focus-bg))',
                opacity: isHandleHovered ? 1 : 0.75,
                transition: 'all 0.18s ease',
              }}
            />
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.05em',
                lineHeight: 1,
                color: isHandleHovered ? 'var(--primary)' : 'var(--text-muted)',
                background: isHandleHovered
                  ? 'color-mix(in srgb, var(--primary) 18%, var(--surface-elevated))'
                  : 'var(--surface-elevated)',
                border: isHandleHovered
                  ? '1px solid color-mix(in srgb, var(--primary) 55%, var(--border))'
                  : '1px solid color-mix(in srgb, var(--text-muted) 35%, var(--border))',
                borderRadius: 999,
                padding: '4px 10px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
                animation: isHandleHovered ? 'none' : 'focus-zone-grip-pulse 1.9s ease-in-out infinite',
                transition: 'all 0.18s ease',
              }}
            >
              ⇔
            </div>
          </div>
        </div>
        <div style={{ padding: '28px 28px 24px' }}>
          {/* ── Section 1: Header ─────────────────────────────────────────────── */}
          <div
            className="focus-zone-header"
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 28,
            }}
          >
            <div>
              <h2
                key={conceptName}
                className="focus-zone-concept-title"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.1,
                  letterSpacing: '-0.01em',
                }}
              >
                {conceptName}
              </h2>
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  fontWeight: 600,
                  color: 'var(--primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  marginTop: 6,
                }}
              >
                ACTIVE FOCUS ZONE
              </div>
            </div>

            <button
              onClick={() => setIsCollapsed(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                color: 'var(--text-muted)',
                padding: 6,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Collapse Focus Zone"
            >
              «
            </button>
          </div>

          {/* ── Section 2: Prerequisites ──────────────────────────────────────── */}
          {prerequisites.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={SECTION_HEADING_STYLE}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#3D7A5E',
                    flexShrink: 0,
                  }}
                />
                Prerequisites
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {prerequisites.map((prereq) => (
                  <span
                    key={prereq}
                    className="focus-zone-pill"
                    style={{
                      padding: '4px 10px',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {prereq}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 3: Study Cue ──────────────────────────────────────────── */}
          {studyCue && (
            <div style={{ marginBottom: 28 }}>
              <div
                className="focus-zone-card"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 18px',
                }}
              >
                <div style={{ ...SECTION_HEADING_STYLE, marginBottom: 10 }}>
                  Study Cue
                </div>
                <p
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontStyle: 'italic',
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: 'var(--text-faint)',
                    margin: 0,
                  }}
                >
                  &ldquo;{studyCue}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* ── Section 4: Source Document ────────────────────────────────────── */}
          {(documentUrl || documentText) && (
            <div>
              <div style={SECTION_HEADING_STYLE}>Source Notes</div>
              {documentFileName && (
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {documentFileName.includes('/') ? documentFileName.split('/').pop() : documentFileName}
                </div>
              )}
              {themedDocumentUrl ? (
                <div className="focus-zone-doc-frame" style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <iframe
                    src={themedDocumentUrl}
                    style={{
                      width: '100%',
                      height: 420,
                      border: 'none',
                      display: 'block',
                      background: 'var(--bg)',
                    }}
                    title="Source Document"
                  />
                </div>
              ) : documentText ? (
                <div
                  className="focus-zone-doc-frame"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    maxHeight: 300,
                    overflowY: 'auto',
                    fontSize: 11,
                    lineHeight: 1.65,
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {documentText.slice(0, 5000)}
                  {documentText.length > 5000 && (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      ...and more
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
