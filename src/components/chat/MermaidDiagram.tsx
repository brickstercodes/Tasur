'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!ref.current) return;

    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains('light') ? 'default' : 'dark',
          themeVariables: {
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            fontSize: '13px',
          },
        });

        const { svg } = await mermaid.render(idRef.current, chart.trim());
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <pre style={{ color: 'var(--text-muted)', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {chart}
      </pre>
    );
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: 320,
        padding: '4px 0',
      }}
    >
      <div ref={ref} style={{ minWidth: 'max-content' }} />
    </div>
  );
}
