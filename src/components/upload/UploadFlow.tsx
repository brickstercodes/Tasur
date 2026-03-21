/**
 * WHY: Client component that owns the full upload-to-mindmap user flow.
 *
 * Renders three sequential states:
 *   1. IDLE — File dropzone + subject hint + learning mode selector + submit button.
 *   2. PROCESSING — Real-time SSE progress bar with step labels. The user can see
 *      exactly which phase the pipeline is in (extracting → mindmap → structure →
 *      gaps → flashcards → saving → done).
 *   3. ERROR — Inline error message with a retry button.
 *
 * The component POSTs multipart/form-data to POST /api/sessions/upload and reads
 * the SSE response stream manually (EventSource doesn't support POST). On the
 * "done" event, it navigates to /study/[sessionId]/mindmap.
 *
 * For multi-document upload (adding to an existing session), pass `existingSessionId`.
 * The route changes to POST /api/sessions/[id]/documents, same SSE protocol.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadState = 'idle' | 'processing' | 'error';

interface ProgressEvent {
  type: 'progress';
  step: string;
  label: string;
  percent: number;
}

interface DoneEvent {
  type: 'done';
  sessionId: string;
  label: string;
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

type SseEvent = ProgressEvent | DoneEvent | ErrorEvent;

interface UploadFlowProps {
  /** If provided, adds a document to this session instead of creating a new one. */
  existingSessionId?: string;
  onCancel?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.png,.jpg,.jpeg';

const STEP_ORDER = ['extracting', 'generating_mm', 'analyzing', 'searching', 'flashcards', 'saving'];

const MODES = [
  { value: 'steady', label: 'Steady', description: 'Deep understanding — full concept walkthrough' },
  { value: 'fast', label: 'Fast', description: 'Exam pressure — essentials first, rapid recall' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function UploadFlow({ existingSessionId, onCancel }: UploadFlowProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [domain, setDomain] = useState('');
  const [mode, setMode] = useState<'steady' | 'fast'>('steady');
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Upload + SSE stream ────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedFile) return;

    setUploadState('processing');
    setProgressPercent(3);
    setProgressLabel('Starting…');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('domain', domain.trim() || 'general');
    formData.append('mode', mode);
    if (!existingSessionId) {
      formData.append('title', selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }

    const endpoint = existingSessionId
      ? `/api/sessions/${existingSessionId}/documents`
      : '/api/sessions/upload';

    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', body: formData });
    } catch {
      setUploadState('error');
      setErrorMessage('Network error — check your connection and try again.');
      return;
    }

    if (!response.ok || !response.body) {
      setUploadState('error');
      setErrorMessage(`Server error (${response.status}) — please try again.`);
      return;
    }

    // Read SSE stream manually (EventSource doesn't support POST)
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const raw of events) {
        const line = raw.trim();
        if (!line.startsWith('data: ')) continue;

        let parsed: SseEvent;
        try {
          parsed = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (parsed.type === 'progress') {
          setProgressLabel(parsed.label);
          setProgressPercent(parsed.percent);
        } else if (parsed.type === 'done') {
          setProgressLabel(parsed.label);
          setProgressPercent(100);
          router.push(`/study/${parsed.sessionId}/mindmap`);
          return;
        } else if (parsed.type === 'error') {
          setUploadState('error');
          setErrorMessage(parsed.message);
          return;
        }
      }
    }
  }, [selectedFile, domain, mode, existingSessionId, router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (uploadState === 'processing') {
    return <ProcessingView label={progressLabel} percent={progressPercent} />;
  }

  if (uploadState === 'error') {
    return (
      <ErrorView
        message={errorMessage}
        onRetry={() => {
          setUploadState('idle');
          setProgressPercent(0);
          setProgressLabel('');
          setErrorMessage('');
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      {/* ── File dropzone ──────────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#6366f1' : selectedFile ? '#86efac' : '#cbd5e1'}`,
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#eef2ff' : selectedFile ? '#f0fdf4' : '#fafafa',
          transition: 'all 0.15s ease',
          marginBottom: 20,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {selectedFile ? (
          <>
            <p style={{ fontSize: 28, margin: '0 0 6px' }}>📄</p>
            <p style={{ margin: 0, fontWeight: 600, color: '#166534', fontSize: 14 }}>
              {selectedFile.name}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {formatFileSize(selectedFile.size)} · Click to change
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>📂</p>
            <p style={{ margin: 0, fontWeight: 600, color: '#334155', fontSize: 14 }}>
              Drop your notes here or click to browse
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
              PDF, DOCX, TXT, or image — up to 50 MB
            </p>
          </>
        )}
      </div>

      {/* ── Subject hint ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Subject (optional)</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. DBMS, Operating Systems, Computer Networks"
          style={inputStyle}
        />
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
          Helps the AI use the right terminology and examples for your subject.
        </p>
      </div>

      {/* ── Learning mode ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Learning mode</label>
        <div style={{ display: 'flex', gap: 10 }}>
          {MODES.map(({ value, label, description }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: `2px solid ${mode === value ? '#6366f1' : '#e2e8f0'}`,
                borderRadius: 8,
                background: mode === value ? '#eef2ff' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.12s ease',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: mode === value ? '#4338ca' : '#334155' }}>
                {value === 'fast' ? '⚡ ' : '◎ '}{label}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                {description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          disabled={!selectedFile}
          onClick={handleSubmit}
          style={{
            flex: 1,
            padding: '11px 20px',
            background: selectedFile ? '#6366f1' : '#e2e8f0',
            color: selectedFile ? 'white' : '#94a3b8',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: selectedFile ? 'pointer' : 'not-allowed',
            transition: 'background 0.12s ease',
            fontFamily: 'inherit',
          }}
        >
          {existingSessionId ? 'Add Document' : 'Start Studying'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '11px 16px',
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              color: '#64748b',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function ProcessingView({ label, percent }: { label: string; percent: number }) {
  const activeStepIndex = STEP_ORDER.findIndex((s) => label.toLowerCase().includes(s.split('_')[0]));

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '24px 0' }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '3px solid #e2e8f0',
            borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
          {label || 'Processing…'}
        </p>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 6,
          background: '#e2e8f0',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: '#6366f1',
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        {STEP_LABELS.map(({ key, label: stepLabel }, i) => {
          const isDone = i < activeStepIndex;
          const isActive = i === activeStepIndex;
          return (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isDone ? '#22c55e' : isActive ? '#6366f1' : '#e2e8f0',
                  margin: '0 auto 4px',
                  transition: 'background 0.2s',
                }}
              />
              <p style={{ margin: 0, fontSize: 10, color: isActive ? '#4338ca' : '#94a3b8', fontWeight: isActive ? 600 : 400 }}>
                {stepLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STEP_LABELS = [
  { key: 'extracting', label: 'Extract' },
  { key: 'generating_mm', label: 'Mindmap' },
  { key: 'analyzing', label: 'Analyse' },
  { key: 'searching', label: 'Gaps' },
  { key: 'flashcards', label: 'Cards' },
  { key: 'saving', label: 'Save' },
];

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '24px 0' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>⚠️</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>
        Something went wrong
      </p>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '9px 20px',
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: 7,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Try again
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  marginBottom: 6,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 13,
  color: '#334155',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
