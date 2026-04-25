/**
 * WHY: Client-side landing for partner-integration imports (e.g. the
 * Notesportal "Study with Tasur" button).
 *
 * Renders the URL-param-driven import card and owns the submit flow:
 *   1. Build JSON body from URL params + form state.
 *   2. POST /api/import/notesportal.
 *   3. On 401: stash params to sessionStorage so /dashboard can replay
 *      after auth, then redirect to /signup. The user signs up, lands
 *      on /dashboard, and the pending-import handler bounces them back
 *      to /import?... — at which point they're authed and the submit
 *      goes through.
 *   4. On JSON dedup hit: navigate straight to the existing session.
 *   5. Otherwise the response is the Go pipeline SSE stream; we read it
 *      the same way UploadFlow does and navigate on `done`.
 *
 * Why a separate component vs. reusing UploadFlow:
 *   UploadFlow expects a File picked by the user. Here the file is
 *   identified by URL — the server fetches it. We also want a dedup
 *   short-circuit that's irrelevant to the regular upload path.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TasurWordmark } from '@/components/ui/TasurWordmark';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ImportParams {
  source: string;
  sourceId: string;
  fileUrl: string;
  title: string;
  subject?: string;
}

type Mode = 'fast' | 'steady';
type Status = 'ready' | 'processing' | 'error' | 'redirecting';

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

interface SessionCreatedEvent {
  type: 'session_created';
  sessionId: string;
  title?: string;
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

interface QueuedEvent {
  type: 'queued';
  position: number;
  label: string;
}

type SseEvent = ProgressEvent | DoneEvent | ErrorEvent | QueuedEvent | SessionCreatedEvent;

// ── Storage keys for the auth-bounce flow ─────────────────────────────────

/** Set when an unauthed submit redirects to /signup; read by the dashboard
 *  PendingImportRedirect to bounce the user back to /import?… */
export const PENDING_IMPORT_STORAGE_KEY = 'tasur:pendingImport';

/** One-shot flag set by PendingImportRedirect just before bouncing back.
 *  Causes ImportLanding to auto-fire handleSubmit on mount, so the user
 *  doesn't have to click "Study" twice. */
export const AUTOSUBMIT_FLAG_STORAGE_KEY = 'tasur:autoImportSubmit';

// ── Component ─────────────────────────────────────────────────────────────

export function ImportLanding() {
  const router = useRouter();

  // Parse params from the current URL on mount. Re-run on history changes
  // (back/forward) is unnecessary here — partner links are single-use.
  const [params, setParams] = useState<ImportParams | null>(null);
  const [paramError, setParamError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URL(window.location.href).searchParams;
    const source = (sp.get('source') ?? '').trim();
    const sourceId = (sp.get('sourceId') ?? '').trim();
    const fileUrl = (sp.get('fileUrl') ?? '').trim();
    const title = (sp.get('title') ?? '').trim();
    const subject = (sp.get('subject') ?? '').trim();

    if (!source || !sourceId || !fileUrl || !title) {
      setParamError(
        'This import link is missing required information. Ask the partner to regenerate it.',
      );
      return;
    }
    setParams({ source, sourceId, fileUrl, title, subject: subject || undefined });
  }, []);

  // Form state — pre-filled, user can tweak before submitting.
  const [mode, setMode] = useState<Mode>('steady');
  const [generateFlashcards, setGenerateFlashcards] = useState(true);

  const [status, setStatus] = useState<Status>('ready');
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // After the auth bounce, PendingImportRedirect sets a one-shot autosubmit
  // flag. If we see it, fire handleSubmit as soon as params are loaded so
  // the user doesn't have to click "Study" twice.
  useEffect(() => {
    if (!params) return;
    if (typeof window === 'undefined') return;
    let flag: string | null = null;
    try {
      flag = sessionStorage.getItem(AUTOSUBMIT_FLAG_STORAGE_KEY);
    } catch {
      return;
    }
    if (!flag) return;
    try {
      sessionStorage.removeItem(AUTOSUBMIT_FLAG_STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
    // Microtask gap so handleSubmit's stable identity is available.
    queueMicrotask(() => {
      handleSubmitRef.current?.();
    });
  }, [params]);

  // handleSubmit ref so the autosubmit effect doesn't depend on it directly
  // (which would re-fire whenever mode/flashcards toggles change).
  const handleSubmitRef = useRef<(() => void) | null>(null);

  const sourceLabel = useMemo(() => {
    if (!params) return '';
    if (params.source === 'notesportal') return 'Notesportal';
    return params.source;
  }, [params]);

  // ── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!params) return;

    setStatus('processing');
    setProgressLabel('Importing…');
    setProgressPercent(3);
    setErrorMessage('');

    let response: Response;
    try {
      response = await fetch('/api/import/notesportal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: params.source,
          sourceId: params.sourceId,
          fileUrl: params.fileUrl,
          title: params.title,
          subject: params.subject,
          mode,
          generateFlashcards,
        }),
      });
    } catch {
      setStatus('error');
      setErrorMessage('Network error — check your connection and try again.');
      return;
    }

    // Auth required — stash params and redirect to signup. The dashboard
    // pending-import handler will bounce the user back to /import after
    // signup completes.
    if (response.status === 401) {
      try {
        sessionStorage.setItem(
          PENDING_IMPORT_STORAGE_KEY,
          JSON.stringify({ ...params, mode, generateFlashcards }),
        );
      } catch {
        /* private mode etc — fall through */
      }
      setStatus('redirecting');
      router.push('/signup');
      return;
    }

    const contentType = response.headers.get('content-type') ?? '';

    // Dedup hit (JSON response).
    if (contentType.includes('application/json')) {
      let payload: { sessionId?: string; dedup?: boolean; error?: string } = {};
      try {
        payload = await response.json();
      } catch {
        /* fall through to error */
      }
      if (response.ok && payload.sessionId) {
        setStatus('redirecting');
        router.push(`/study/${payload.sessionId}/mindmap`);
        return;
      }
      setStatus('error');
      setErrorMessage(payload.error ?? `Import failed (HTTP ${response.status}).`);
      return;
    }

    // SSE stream from the Go pipeline.
    if (!response.body) {
      setStatus('error');
      setErrorMessage('Empty response from the import service. Please try again.');
      return;
    }

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
          parsed = JSON.parse(line.slice(6)) as SseEvent;
        } catch {
          continue;
        }

        if (parsed.type === 'queued') {
          setProgressLabel(parsed.label);
        } else if (parsed.type === 'progress') {
          setProgressLabel(parsed.label);
          setProgressPercent(parsed.percent);
        } else if (parsed.type === 'session_created') {
          // No-op on the client — the API route is recording the
          // imported_sources mapping when this fires.
        } else if (parsed.type === 'done') {
          setProgressPercent(100);
          setProgressLabel(parsed.label);
          setStatus('redirecting');
          router.push(`/study/${parsed.sessionId}/mindmap`);
          return;
        } else if (parsed.type === 'error') {
          setStatus('error');
          setErrorMessage(parsed.message);
          return;
        }
      }
    }

    // Stream closed without done/error.
    setStatus('error');
    setErrorMessage('Processing timed out — please try again.');
  }, [params, mode, generateFlashcards, router]);

  // Keep the ref in sync so the autosubmit effect can call the latest closure.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit, handleSubmitRef]);

  // ── Renders ─────────────────────────────────────────────────────────────

  if (paramError) {
    return <Shell><Message tone="error" title="Invalid import link">{paramError}</Message></Shell>;
  }

  if (!params) {
    return <Shell><Message tone="muted" title="Loading…" /></Shell>;
  }

  if (status === 'processing' || status === 'redirecting') {
    return (
      <Shell>
        <ProgressView label={progressLabel} percent={progressPercent} />
      </Shell>
    );
  }

  if (status === 'error') {
    return (
      <Shell>
        <Message tone="error" title="Something went wrong">{errorMessage}</Message>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setStatus('ready')}
            className="manuscript-button"
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Imported from {sourceLabel}
      </p>

      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--text)',
          fontFamily: "'Instrument Serif', Georgia, serif",
          lineHeight: 1.2,
          marginBottom: 6,
        }}
      >
        {params.title}
      </h1>

      {params.subject && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          {params.subject}
        </p>
      )}

      <div
        style={{
          padding: '14px 16px',
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: 22,
          fontSize: 13,
          color: 'var(--text-muted)',
          fontFamily: 'Inter, sans-serif',
          background: 'var(--surface)',
        }}
      >
        Tasur will fetch the document, build a mindmap, and create a study canvas you
        can resume any time. Click <strong>Study</strong> to begin.
      </div>

      {/* Mode toggle (compact) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <ModeChip
          label="Steady"
          description="Deep analysis"
          selected={mode === 'steady'}
          onClick={() => setMode('steady')}
        />
        <ModeChip
          label="Fast"
          description="Swift generation"
          selected={mode === 'fast'}
          onClick={() => setMode('fast')}
        />
      </div>

      {/* Flashcard toggle */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <span>Generate flashcards</span>
        <input
          type="checkbox"
          checked={generateFlashcards}
          onChange={(e) => setGenerateFlashcards(e.target.checked)}
          style={{ accentColor: 'var(--primary)' }}
        />
      </label>

      <button
        type="button"
        onClick={handleSubmit}
        className="manuscript-button"
        style={{
          width: '100%',
          padding: '13px 20px',
          fontSize: 14,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        Study with <TasurWordmark size={16} color="#ffffff" />
      </button>
    </Shell>
  );
}

// ── Subviews ──────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="app-fade-up"
      style={{ maxWidth: 520, margin: '60px auto', padding: '0 20px' }}
    >
      <div
        className="manuscript-card"
        style={{
          padding: '32px 28px',
          borderRadius: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModeChip({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px 14px',
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: selected ? 'var(--surface-elevated)' : 'var(--surface)',
        borderRadius: 10,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.12s ease',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
    </button>
  );
}

function ProgressView({ label, percent }: { label: string; percent: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'Inter, sans-serif' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p
        style={{
          margin: '0 0 4px',
          fontSize: 18,
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          color: 'var(--text)',
        }}
      >
        {label || 'Working…'}
      </p>
      <div
        style={{
          height: 3,
          background: 'var(--border)',
          borderRadius: 99,
          overflow: 'hidden',
          margin: '18px auto 0',
          maxWidth: 320,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: 'var(--primary)',
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

function Message({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'muted';
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p
        style={{
          margin: '0 0 8px',
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 20,
          color: tone === 'error' ? 'var(--text)' : 'var(--text-muted)',
        }}
      >
        {title}
      </p>
      {children && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {children}
        </p>
      )}
    </div>
  );
}
