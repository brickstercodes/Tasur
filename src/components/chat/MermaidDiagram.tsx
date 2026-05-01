'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [naturalW, setNaturalW] = useState<number | null>(null);
  const [naturalH, setNaturalH] = useState<number | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!svgRef.current) return;
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
        if (cancelled || !svgRef.current) return;

        svgRef.current.innerHTML = svg;
        setError(null);

        // Read the SVG's natural dimensions so we can size the container exactly
        const svgEl = svgRef.current.querySelector('svg');
        if (svgEl) {
          // Mermaid sets width/height as attributes (may be px or unitless)
          const parseAttr = (v: string | null) => v ? parseFloat(v) : null;
          let w = parseAttr(svgEl.getAttribute('width'));
          let h = parseAttr(svgEl.getAttribute('height'));

          // Fall back to viewBox if attributes are missing / 0
          if (!w || !h) {
            const vb = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
            if (vb && vb.length === 4) { w = vb[2]; h = vb[3]; }
          }

          if (w && h) {
            // Remove fixed attrs so CSS controls size
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';
            setNaturalW(w);
            setNaturalH(h);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [chart]);

  // Reset zoom when chart changes
  useEffect(() => { setZoom(1); }, [chart]);

  const changeZoom = useCallback((delta: number) => {
    setZoom(z => Math.min(2, Math.max(0.4, Math.round((z + delta) * 10) / 10)));
  }, []);

  if (error) {
    return (
      <pre style={{ color: 'var(--text-muted)', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {chart}
      </pre>
    );
  }

  // Container fills the SVG's natural size * zoom; scrolls only if it overflows its parent
  const scaledW = naturalW ? naturalW * zoom : undefined;
  const scaledH = naturalH ? naturalH * zoom : undefined;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Zoom controls — shown once SVG is rendered */}
      {naturalW && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '2px 4px',
          }}
        >
          <button
            onClick={() => changeZoom(-0.1)}
            disabled={zoom <= 0.4}
            title="Zoom out"
            style={zoomBtnStyle}
          >
            −
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 28, textAlign: 'center', userSelect: 'none' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => changeZoom(0.1)}
            disabled={zoom >= 2}
            title="Zoom in"
            style={zoomBtnStyle}
          >
            +
          </button>
        </div>
      )}

      {/* Scrollable viewport — only scrolls when zoomed beyond container width */}
      <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
        <div
          ref={svgRef}
          style={{
            width: scaledW ?? '100%',
            height: scaledH ?? undefined,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text)',
  fontSize: 14,
  lineHeight: 1,
  padding: '1px 4px',
  borderRadius: 4,
  fontFamily: 'monospace',
};
