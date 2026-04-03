/**
 * WHY: Global singleton that keeps upload SSE connections alive across page navigations.
 *
 * When the user starts an upload and navigates back to the dashboard, the SSE
 * reader must continue running in the background. This module holds the active
 * upload state in a module-level Map so it survives React component unmounts.
 *
 * Listeners (e.g. the dashboard) subscribe to state changes and re-render
 * placeholder tiles with live progress.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActiveUpload {
  sessionId: string;
  title: string;
  domain: string;
  mode: 'steady' | 'fast';
  step: string;
  label: string;
  percent: number;
  status: 'processing' | 'done' | 'error';
  errorMessage?: string;
}

type Listener = () => void;

// ── Store ────────────────────────────────────────────────────────────────────

const uploads = new Map<string, ActiveUpload>();
const listeners = new Set<Listener>();

// Cached snapshot for useSyncExternalStore — only rebuilt on notify().
// IMPORTANT: the initial value must be a module-level constant so that
// getSnapshot and getServerSnapshot return the same reference during hydration.
const EMPTY: ActiveUpload[] = [];
let snapshot: ActiveUpload[] = EMPTY;

function notify() {
  snapshot = Array.from(uploads.values());
  for (const fn of listeners) fn();
}

export function getActiveUploads(): ActiveUpload[] {
  return snapshot;
}

/** Stable empty array for SSR — same reference as initial snapshot. */
export const EMPTY_UPLOADS = EMPTY;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function removeUpload(sessionId: string) {
  uploads.delete(sessionId);
  notify();
}

// ── Background SSE reader ────────────────────────────────────────────────────

/**
 * Starts a background upload. Fires the POST, reads SSE events, and updates
 * the store. Returns a promise that resolves with the sessionId on success,
 * or rejects on error.
 *
 * The caller can navigate away immediately — the reader keeps running.
 */
export function startBackgroundUpload(
  formData: FormData,
  meta: { title: string; domain: string; mode: 'steady' | 'fast' },
  endpoint: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Placeholder entry while we wait for session_created
    const tempId = `pending-${Date.now()}`;
    uploads.set(tempId, {
      sessionId: tempId,
      title: meta.title,
      domain: meta.domain,
      mode: meta.mode,
      step: 'starting',
      label: 'Starting...',
      percent: 3,
      status: 'processing',
    });
    notify();

    fetch(endpoint, { method: 'POST', body: formData })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => '');
          const isHtml = text.trimStart().startsWith('<');
          const msg = (!isHtml && text) || `Server error (${response.status})`;
          uploads.delete(tempId);
          notify();
          reject(new Error(msg));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let realSessionId: string | null = null;

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const raw of events) {
              const line = raw.trim();
              if (!line.startsWith('data: ')) continue;

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(line.slice(6));
              } catch {
                continue;
              }

              if (parsed.type === 'session_created') {
                realSessionId = parsed.sessionId as string;
                // Swap temp entry for real one
                const existing = uploads.get(tempId);
                uploads.delete(tempId);
                uploads.set(realSessionId, {
                  ...(existing ?? {
                    title: meta.title,
                    domain: meta.domain,
                    mode: meta.mode,
                    step: 'starting',
                    label: 'Starting...',
                    percent: 3,
                    status: 'processing' as const,
                  }),
                  sessionId: realSessionId,
                  title: (parsed.title as string) || meta.title,
                });
                notify();
                resolve(realSessionId);
              } else if (parsed.type === 'progress') {
                const id = realSessionId ?? tempId;
                const entry = uploads.get(id);
                if (entry) {
                  entry.step = (parsed.step as string) || entry.step;
                  entry.label = (parsed.label as string) || entry.label;
                  entry.percent = (parsed.percent as number) ?? entry.percent;
                  notify();
                }
              } else if (parsed.type === 'queued') {
                const id = realSessionId ?? tempId;
                const entry = uploads.get(id);
                if (entry) {
                  entry.label = (parsed.label as string) || 'In queue...';
                  notify();
                }
              } else if (parsed.type === 'done') {
                const id = realSessionId ?? tempId;
                const entry = uploads.get(id);
                if (entry) {
                  entry.status = 'done';
                  entry.percent = 100;
                  entry.label = (parsed.label as string) || 'Done!';
                  notify();
                }
                // Keep entry briefly so dashboard can show completion, then remove
                setTimeout(() => {
                  uploads.delete(id);
                  notify();
                }, 2000);
              } else if (parsed.type === 'error') {
                const id = realSessionId ?? tempId;
                const entry = uploads.get(id);
                if (entry) {
                  entry.status = 'error';
                  entry.errorMessage = parsed.message as string;
                  notify();
                }
                // Remove after a delay so the user can see the error
                setTimeout(() => {
                  uploads.delete(id);
                  notify();
                }, 8000);
                if (!realSessionId) {
                  uploads.delete(tempId);
                  notify();
                  reject(new Error(parsed.message as string));
                }
              }
            }
          }

          // Stream ended without done/error — treat as timeout
          const id = realSessionId ?? tempId;
          const entry = uploads.get(id);
          if (entry && entry.status === 'processing') {
            entry.status = 'error';
            entry.errorMessage = 'Processing timed out — please try again.';
            notify();
            setTimeout(() => {
              uploads.delete(id);
              notify();
            }, 8000);
          }
          if (!realSessionId) {
            uploads.delete(tempId);
            notify();
            reject(new Error('Processing timed out'));
          }
        };

        processStream().catch((err) => {
          const id = realSessionId ?? tempId;
          uploads.delete(id);
          notify();
          if (!realSessionId) reject(err);
        });
      })
      .catch((err) => {
        uploads.delete(tempId);
        notify();
        reject(err);
      });
  });
}
