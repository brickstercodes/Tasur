'use client';

import { useEffect } from 'react';

// TEMPORARY diagnostic boundary — remove once the pptx-upload mindmap 500 is
// root-caused. Surfaces the actual error message and digest on-screen so we
// don't have to dig through Railway logs.
export default function MindmapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[mindmap page error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div
      style={{
        padding: 32,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        color: '#2a1a1a',
        background: '#fdf4f4',
        border: '1px solid #e6bcbc',
        borderRadius: 8,
        margin: 24,
        maxWidth: 960,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
        Mindmap page crashed (diagnostic boundary — temporary)
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ opacity: 0.6 }}>message: </span>
        {error.message || '(empty)'}
      </div>

      {error.digest ? (
        <div style={{ marginBottom: 8 }}>
          <span style={{ opacity: 0.6 }}>digest: </span>
          {error.digest}
        </div>
      ) : null}

      {error.stack ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', opacity: 0.7 }}>stack</summary>
          <pre style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            {error.stack}
          </pre>
        </details>
      ) : null}

      <button
        onClick={reset}
        style={{
          marginTop: 16,
          padding: '6px 14px',
          fontSize: 12,
          background: '#2a1a1a',
          color: '#fdf4f4',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}
