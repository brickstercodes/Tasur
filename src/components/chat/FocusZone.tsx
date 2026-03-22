'use client';

import React, { useState } from 'react';

interface FocusZoneProps {
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
  color: '#554339',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export function FocusZone({
  conceptName,
  prerequisites,
  studyCue,
  documentText,
  documentFileName,
  documentUrl,
  documentFileType,
}: FocusZoneProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <aside
        style={{
          width: 44,
          flexShrink: 0,
          borderLeft: '1px solid #ECEAE2',
          background: '#f4f4f1',
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
            color: '#78716C',
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
        .focus-zone-scroll::-webkit-scrollbar-thumb { background: #eeeeeb; border-radius: 10px; }
      `}</style>
      <aside
        className="focus-zone-scroll"
        style={{
          width: '340px',
          flexShrink: 0,
          borderLeft: '1px solid #ECEAE2',
          background: '#f4f4f1',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '28px 28px 24px' }}>
          {/* ── Section 1: Header ─────────────────────────────────────────────── */}
          <div
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
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  color: '#1a1c1b',
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
                  color: '#944604',
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
                color: '#78716C',
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
                    background: '#3B6FA0',
                    flexShrink: 0,
                  }}
                />
                Prerequisites
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {prerequisites.map((prereq) => (
                  <span
                    key={prereq}
                    style={{
                      padding: '4px 10px',
                      background: 'white',
                      border: '1px solid rgba(219,193,180,0.2)',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#554339',
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
                style={{
                  background: '#eeeeeb',
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
                    color: '#554339',
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
                    color: '#887367',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {documentFileName.includes('/') ? documentFileName.split('/').pop() : documentFileName}
                </div>
              )}
              {documentUrl ? (
                <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(219,193,180,0.2)' }}>
                  <iframe
                    src={documentUrl}
                    style={{
                      width: '100%',
                      height: 420,
                      border: 'none',
                      display: 'block',
                      background: '#fafaf8',
                    }}
                    title="Source Document"
                    sandbox="allow-same-origin allow-scripts"
                  />
                </div>
              ) : documentText ? (
                <div
                  style={{
                    background: 'white',
                    border: '1px solid rgba(219,193,180,0.15)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    maxHeight: 300,
                    overflowY: 'auto',
                    fontSize: 11,
                    lineHeight: 1.65,
                    color: '#554339',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {documentText.slice(0, 5000)}
                  {documentText.length > 5000 && (
                    <span style={{ color: '#A8A29E', fontStyle: 'italic' }}>
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
