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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SteadyIcon, FastIcon } from '@/components/ui/ModeIcons';
import { saveDocToCache } from '@/lib/doc-cache';
import { startBackgroundUpload } from '@/lib/upload-store';

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

interface QueuedEvent {
  type: 'queued';
  position: number;
  label: string;
}

type SseEvent = ProgressEvent | DoneEvent | ErrorEvent | QueuedEvent;

interface UploadFlowProps {
  /** If provided, adds a document to this session instead of creating a new one. */
  existingSessionId?: string;
  onCancel?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const STEP_ORDER = ['extracting', 'generating_mm', 'analyzing', 'searching', 'flashcards', 'saving'];

const MODES = [
  {
    value: 'steady',
    label: 'Steady',
    description: 'Deep analysis for complex manuscripts.',
    iconBg: '#DAEEE6',
    Icon: SteadyIcon,
  },
  {
    value: 'fast',
    label: 'Fast',
    description: 'Swift generation for quick review sessions.',
    iconBg: '#FDDEDE',
    Icon: FastIcon,
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function UploadFlow({ existingSessionId, onCancel }: UploadFlowProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [domain, setDomain] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [mode, setMode] = useState<'steady' | 'fast'>('steady');
  const [generateFlashcards, setGenerateFlashcards] = useState(true);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [queuePosition, setQueuePosition] = useState(0);
  const [queueLabel, setQueueLabel] = useState('');

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'ppt' || ext === 'pptx') {
      setUploadState('error');
      setErrorMessage('PowerPoint files (.ppt, .pptx) are not supported. Please export your slides as PDF and upload that instead.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadState('error');
      setErrorMessage(
        `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the maximum is 25 MB. ` +
        'For best results, upload individual chapters rather than entire textbooks.',
      );
      return;
    }
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

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('domain', domain.trim() || 'general');
    formData.append('mode', mode);
    formData.append('generateFlashcards', String(generateFlashcards));
    if (customInstructions.trim()) {
      formData.append('customInstructions', customInstructions.trim());
    }

    const title = selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    // ── New session: background upload, navigate to dashboard immediately ──
    if (!existingSessionId) {
      formData.append('title', title);

      setUploadState('processing');
      setProgressPercent(3);
      setProgressLabel('Starting…');

      try {
        // Cache file locally before navigating so FocusZone can render the real PDF.
        const sessionId = await startBackgroundUpload(
          formData,
          { title, domain: domain.trim() || 'general', mode },
          '/api/sessions/upload',
        );
        try { await saveDocToCache(sessionId, selectedFile); } catch { /* non-fatal */ }
        // Navigate to dashboard — the upload continues in the background
        router.push('/dashboard');
      } catch (err) {
        setUploadState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong — please try again.');
      }
      return;
    }

    // ── Add document to existing session: stay on page with SSE progress ──
    setUploadState('processing');
    setProgressPercent(3);
    setProgressLabel('Starting…');

    const endpoint = `/api/sessions/${existingSessionId}/documents`;

    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', body: formData });
    } catch {
      setUploadState('error');
      setErrorMessage('Network error — check your connection and try again.');
      return;
    }

    if (!response.ok || !response.body) {
      const responseText = await response.text().catch(() => '');
      const isHtml = responseText.trimStart().startsWith('<');
      if (response.status === 422) {
        setUploadState('error');
        setErrorMessage(
          (!isHtml && responseText) || 'Your custom instructions were rejected — please revise them.',
        );
      } else {
        setUploadState('error');
        setErrorMessage(
          (!isHtml && responseText) || `Server error (${response.status}) — please try again.`,
        );
      }
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

        if (parsed.type === 'queued') {
          setQueuePosition(parsed.position);
          setQueueLabel(parsed.label);
        } else if (parsed.type === 'progress') {
          setQueuePosition(0);
          setProgressLabel(parsed.label);
          setProgressPercent(parsed.percent);
        } else if (parsed.type === 'done') {
          setProgressLabel(parsed.label);
          setProgressPercent(100);
          try { await saveDocToCache(parsed.sessionId, selectedFile); } catch { /* non-fatal */ }
          router.push(`/study/${parsed.sessionId}/mindmap`);
          return;
        } else if (parsed.type === 'error') {
          setUploadState('error');
          setErrorMessage(parsed.message);
          return;
        }
      }
    }

    // Stream closed without a done or error event
    setUploadState('error');
    setErrorMessage('Processing timed out — please try again. Large files may take longer.');
  }, [selectedFile, domain, customInstructions, mode, generateFlashcards, existingSessionId, router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (uploadState === 'processing') {
    return <ProcessingView label={progressLabel} percent={progressPercent} showFlashcardStep={generateFlashcards} queuePosition={queuePosition} queueLabel={queueLabel} />;
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
          setQueuePosition(0);
          setQueueLabel('');
        }}
      />
    );
  }

  return (
    <div className="upload-flow-shell" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── File dropzone ──────────────────────────────────────────────────── */}
      <div
        className={`upload-dropzone${dragOver ? ' is-dragging' : ''}${selectedFile ? ' has-file' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver || selectedFile ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver || selectedFile ? 'color-mix(in srgb, var(--primary) 8%, var(--surface))' : 'var(--surface)',
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
            <p style={{ fontSize: 24, margin: '0 0 8px', color: 'var(--primary)' }}>
              <span className="upload-dropzone-icon">↑</span>
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--text-muted)',
              }}
            >
              {selectedFile.name}
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
              }}
            >
              {formatFileSize(selectedFile.size)} · CLICK TO CHANGE
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 28, margin: '0 0 10px', color: 'var(--text-muted)' }}>
              <span className="upload-dropzone-icon">↑</span>
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 22,
                color: 'var(--text-muted)',
              }}
            >
              Drop your notes here
            </p>
            <p
              style={{
              margin: '8px 0 0',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              }}
            >
              PDF (recommended) · DOCX, TXT, PNG, JPG
            </p>
          </>
        )}
      </div>

      {/* ── Subject hint ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Subject (optional)</label>
        <input
          className="upload-input-line"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. DBMS, Operating Systems, Computer Networks"
          style={inputStyle}
        />
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Helps the AI use the right terminology and examples for your subject.
        </p>
      </div>

      {/* ── Custom instructions ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <label style={labelStyle}>Custom instructions (optional)</label>
          <span
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: customInstructions.length > 450
                ? customInstructions.length >= 500 ? '#C25858' : '#C2692A'
                : 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {customInstructions.length} / 500
          </span>
        </div>
        <textarea
          className="upload-input-line"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value.slice(0, 500))}
          placeholder="e.g. Be very detailed and present information in bullet points, or focus more on definitions and examples"
          rows={3}
          style={{
            width: '100%',
            padding: '10px 0',
            border: 'none',
            borderBottom: `1px solid ${customInstructions.length >= 500 ? '#C25858' : 'var(--border)'}`,
            borderRadius: 0,
            fontSize: 14,
            color: 'var(--text)',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box',
            resize: 'none',
            lineHeight: 1.55,
          }}
        />
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Guide the AI on how to structure or present your study material.
        </p>
      </div>

      {/* ── Learning mode ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Learning mode</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {MODES.map(({ value, label, description, iconBg, Icon }) => {
            const isSelected = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`upload-mode-card${isSelected ? ' is-selected' : ''}`}
                style={{
                  flex: 1,
                  padding: '20px 18px',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 14,
                  background: isSelected ? 'var(--surface-elevated)' : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.14s ease',
                  boxShadow: isSelected ? '0 2px 12px rgba(194,105,42,0.20)' : 'none',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Icon size={28} />
                </div>

                {/* Label */}
                <p style={{
                  margin: '0 0 6px',
                  fontWeight: 700,
                  fontSize: 16,
                  color: 'var(--text)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {label}
                </p>

                {/* Description */}
                <p style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.5,
                }}>
                  {description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Flashcard toggle ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Generate flashcards</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {generateFlashcards ? 'Flashcards will be created for review.' : 'Mindmap only — flashcards skipped.'}
          </p>
        </div>
        <button
          className={`upload-toggle${generateFlashcards ? ' is-on' : ''}`}
          type="button"
          onClick={() => setGenerateFlashcards((v) => !v)}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: 'none',
            background: generateFlashcards ? 'var(--primary)' : 'var(--border)',
            cursor: 'pointer',
            position: 'relative',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          <span className="upload-toggle-knob" style={{
            position: 'absolute',
            top: 3,
            left: generateFlashcards ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.15s ease',
          }} />
        </button>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="upload-primary-action"
          type="button"
          disabled={!selectedFile}
          onClick={handleSubmit}
          style={{
            flex: 1,
            padding: '13px 20px',
            background: selectedFile ? undefined : 'var(--border)',
            color: selectedFile ? undefined : 'var(--text)',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: selectedFile ? 'pointer' : 'not-allowed',
            transition: 'opacity 0.12s ease',
            fontFamily: 'inherit',
            opacity: selectedFile ? 1 : 0.7,
          }}
        >
          {existingSessionId ? 'Add Document' : 'Generate Study Canvas'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '13px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-muted)',
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

const BUFFER_PHRASES = [
  'Cooking maps…',
  'Connecting nodes…',
  'Drawing concepts…',
  'Establishing links…',
  'Mapping your knowledge…',
  'Weaving the web…',
  'Thinking deeply…',
  'Building your canvas…',
  'Tracing the threads…',
  'Lighting up pathways…',
  'Reading between lines…',
  'Untangling concepts…',
  'Charting territories…',
  'Assembling the puzzle…',
  'Bridging ideas…',
  'Illuminating gaps…',
  'Sketching the mindscape…',
  'Discovering connections…',
  'Forging new links…',
  'Carving out concepts…',
  'Stitching thoughts…',
  'Painting the picture…',
  'Plotting the course…',
  'Weaving your knowledge…',
  'Extracting the essence…',
  'Crystallising ideas…',
  'Following the threads…',
  'Shaping your study arc…',
  'Laying the groundwork…',
  'Calibrating the compass…',
];

function ProcessingView({ label, percent, showFlashcardStep, queuePosition, queueLabel }: {
  label: string;
  percent: number;
  showFlashcardStep: boolean;
  queuePosition: number;
  queueLabel: string;
}) {
  const visibleStepLabels = showFlashcardStep ? STEP_LABELS : STEP_LABELS.filter((s) => s.key !== 'flashcards');
  const activeStepIndex = STEP_ORDER.findIndex((s) => label.toLowerCase().includes(s.split('_')[0]));
  const isQueued = queuePosition > 0;

  // Cycle through buffer phrases independently of SSE labels
  const [phraseIndex, setPhraseIndex] = useState(() =>
    Math.floor(Math.random() * BUFFER_PHRASES.length)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % BUFFER_PHRASES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="upload-processing-shell" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '24px 0', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <div
          className="upload-spinner"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--primary)',
            animation: isQueued ? 'spin 2.4s linear infinite' : 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
            opacity: isQueued ? 0.6 : 1,
            transition: 'opacity 0.3s ease',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes phrase-fade { 0%,100% { opacity: 1; } 40%,60% { opacity: 0; } }`}</style>
        {isQueued ? (
          <>
            <p style={{
              margin: '0 0 8px',
              fontSize: 18,
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              color: 'var(--text)',
            }}>
              {queuePosition === 1 ? 'Almost there…' : `Position ${queuePosition} in queue`}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              {queueLabel}
            </p>
          </>
        ) : (
          <>
            <p
              key={phraseIndex}
              style={{
                margin: '0 0 4px',
                fontSize: 18,
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                color: 'var(--text)',
                animation: 'phrase-fade 1.8s ease-in-out',
              }}
            >
              {BUFFER_PHRASES[phraseIndex]}
            </p>
            <p style={{ margin: 0, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {label || 'Starting…'}
            </p>
          </>
        )}
      </div>

      {/* Progress bar — thin 3px line */}
      <div
        className="upload-progress-track"
        style={{
          height: 3,
          background: 'var(--border)',
          borderRadius: 99,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          className="upload-progress-fill"
          style={{
            height: '100%',
            width: `${percent}%`,
            background: 'var(--primary)',
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        {visibleStepLabels.map(({ key, label: stepLabel }, i) => {
          const isDone = i < activeStepIndex;
          const isActive = i === activeStepIndex;
          return (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div
                className={`upload-step-dot${isActive ? ' is-active' : ''}`}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: isDone ? '#3D7A5E' : isActive ? 'var(--primary)' : 'var(--border)',
                  margin: '0 auto 4px',
                  transition: 'background 0.2s',
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.02em',
                }}
              >
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
    <div className="upload-error-shell" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '24px 0', fontFamily: 'Inter, sans-serif' }}>
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--text-muted)',
          margin: '0 0 8px',
        }}
      >
        Something went wrong.
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '10px 22px',
          background: 'var(--primary)',
          color: 'var(--text)',
          border: 'none',
          borderRadius: 8,
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
  color: 'var(--text-muted)',
  marginBottom: 8,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontFamily: 'Inter, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 0',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  borderRadius: 0,
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
