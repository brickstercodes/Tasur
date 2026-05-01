'use client';

import React from 'react';
import { MermaidDiagram } from './MermaidDiagram';

/**
 * WHY: Renders inline visual aids that the Concept Explainer agent produces
 * alongside its text response.
 *
 * The explainer's `visual_suggestion` field carries a `type` ('table',
 * 'comparison', 'diagram', 'mermaid') and a `data` record. This component
 * translates those structured payloads into readable UI elements without
 * requiring any additional LLM calls — the data is already produced by the
 * explainer.
 *
 * All four visual types render purely from the `data` record:
 *   table      → rows/columns extracted from { headers, rows }
 *   comparison → two-column card from { left, right, attributes[] }
 *   diagram    → fallback text representation from { description, nodes, edges }
 *   mermaid    → rendered mermaid chart from { chart: string }
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface VisualSuggestionProps {
  type: 'diagram' | 'table' | 'comparison' | 'mermaid';
  data: Record<string, unknown>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function VisualSuggestion({ type, data }: VisualSuggestionProps) {
  return (
    <div
      className="visual-shell"
      style={{
        margin: '12px 0',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        fontSize: 13,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {type === 'table' ? 'Table' : type === 'comparison' ? 'Comparison' : 'Diagram'}
      </div>

      <div style={{ padding: type === 'mermaid' ? '12px' : '12px 16px', background: 'var(--surface-elevated)' }}>
        {type === 'table' && <TableVisual data={data} />}
        {type === 'comparison' && <ComparisonVisual data={data} />}
        {type === 'diagram' && <DiagramVisual data={data} />}
        {type === 'mermaid' && <MermaidVisual data={data} />}
      </div>
    </div>
  );
}

// ── Table visual ──────────────────────────────────────────────────────────────

/**
 * Expects data shape: { headers: string[], rows: string[][] }
 * Falls back to a key-value list for any other shape.
 */
function TableVisual({ data }: { data: Record<string, unknown> }) {
  const headers = Array.isArray(data.headers) ? (data.headers as string[]) : [];
  const rows = Array.isArray(data.rows) ? (data.rows as unknown[][]) : [];

  if (headers.length > 0 && rows.length > 0) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: 'var(--surface-elevated)',
                    borderBottom: '2px solid var(--border)',
                    fontWeight: 600,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? 'var(--surface-elevated)' : 'var(--surface)' }}
              >
                {(Array.isArray(row) ? row : []).map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      verticalAlign: 'top',
                    }}
                  >
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Fallback: render as key-value pairs
  return <KeyValueFallback data={data} />;
}

// ── Comparison visual ─────────────────────────────────────────────────────────

/**
 * Expects data shape: { left: string, right: string, attributes: string[] }
 * or { items: [{ attribute, left, right }] }
 */
function ComparisonVisual({ data }: { data: Record<string, unknown> }) {
  const leftLabel = typeof data.left === 'string' ? data.left : 'A';
  const rightLabel = typeof data.right === 'string' ? data.right : 'B';

  // Support several possible shapes the LLM may emit:
  //   1. { items: [{ attribute, left, right }] }  ← canonical
  //   2. { attributes[], left_values[], right_values[] }
  //   3. { rows: [[attribute, left, right], ...] } ← LLM sometimes uses table format
  let items = Array.isArray(data.items)
    ? normalizeComparisonItems(data.items as Array<Record<string, unknown>>)
    : buildComparisonItems(data);

  if (items.length === 0 && Array.isArray(data.rows)) {
    items = (data.rows as unknown[][]).map((row) => ({
      attribute: String(row[0] ?? ''),
      left: String(row[1] ?? ''),
      right: String(row[2] ?? ''),
    }));
  }

  if (items.length === 0) {
    return <KeyValueFallback data={data} />;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={thStyle('var(--surface-elevated)')}>Property</th>
          <th style={thStyle('var(--surface-elevated)')}>{leftLabel}</th>
          <th style={thStyle('var(--surface-elevated)')}>{rightLabel}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface-elevated)' : 'var(--surface)' }}>
            <td style={tdStyle}><strong>{item.attribute}</strong></td>
            <td style={{ ...tdStyle }}>
              {item.left}
            </td>
            <td style={{ ...tdStyle }}>
              {item.right}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Normalize items where the LLM may use field names other than attribute/left/right */
function normalizeComparisonItems(
  raw: Array<Record<string, unknown>>,
): Array<{ attribute: string; left: string; right: string }> {
  return raw.map((item) => {
    const keys = Object.keys(item);
    // attribute: prefer 'attribute', then 'property', 'name', 'feature', first key
    const attrKey = keys.find(k => /^(attribute|property|name|feature|aspect|criterion)$/i.test(k)) ?? keys[0];
    // left/right: prefer 'left'/'right', then keys 1 and 2, or any remaining keys
    const leftKey = keys.find(k => /^left$/i.test(k)) ?? keys[1];
    const rightKey = keys.find(k => /^right$/i.test(k)) ?? keys[2];
    return {
      attribute: String(item[attrKey] ?? ''),
      left: String(item[leftKey ?? ''] ?? ''),
      right: String(item[rightKey ?? ''] ?? ''),
    };
  });
}

function buildComparisonItems(
  data: Record<string, unknown>,
): Array<{ attribute: string; left: string; right: string }> {
  const attributes = Array.isArray(data.attributes) ? (data.attributes as string[]) : [];
  const leftValues = Array.isArray(data.left_values) ? (data.left_values as string[]) : [];
  const rightValues = Array.isArray(data.right_values) ? (data.right_values as string[]) : [];

  return attributes.map((attr, i) => ({
    attribute: attr,
    left: leftValues[i] ?? '',
    right: rightValues[i] ?? '',
  }));
}

// ── Diagram visual ────────────────────────────────────────────────────────────

/**
 * Renders a text-based diagram description. Actual graph rendering is out of
 * scope for the explainer — the description + nodes/edges give the student a
 * clear structural picture.
 */
function DiagramVisual({ data }: { data: Record<string, unknown> }) {
  const description = typeof data.description === 'string' ? data.description : '';
  const nodes = Array.isArray(data.nodes) ? (data.nodes as string[]) : [];
  const edges = Array.isArray(data.edges)
    ? (data.edges as Array<{ from: string; to: string; label?: string }>)
    : [];

  // Build chains: sequences of nodes connected by edges
  const chains: Array<Array<{ label: string; edgeLabel?: string }>> = [];
  if (edges.length > 0) {
    // Find nodes that are only sources (chain starts)
    const hasIncoming = new Set(edges.map(e => e.to));
    const starts = edges.map(e => e.from).filter(n => !hasIncoming.has(n));
    const uniqueStarts = [...new Set(starts.length > 0 ? starts : edges.map(e => e.from))];

    // Build adjacency map
    const adj = new Map<string, { to: string; label?: string }>();
    for (const e of edges) adj.set(e.from, { to: e.to, label: e.label });

    const visited = new Set<string>();
    for (const start of uniqueStarts) {
      if (visited.has(start)) continue;
      const chain: Array<{ label: string; edgeLabel?: string }> = [{ label: start }];
      visited.add(start);
      let cur = start;
      while (adj.has(cur)) {
        const next = adj.get(cur)!;
        if (visited.has(next.to)) break;
        chain[chain.length - 1].edgeLabel = next.label;
        chain.push({ label: next.to });
        visited.add(next.to);
        cur = next.to;
      }
      chains.push(chain);
    }

    // Any edges not covered by chains (e.g. cycles or multi-source)
    for (const e of edges) {
      if (!visited.has(e.from) || !visited.has(e.to)) {
        chains.push([
          { label: e.from, edgeLabel: e.label },
          { label: e.to },
        ]);
        visited.add(e.from);
        visited.add(e.to);
      }
    }
  }

  // Nodes that don't appear in any edge
  const edgeNodes = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
  const orphans = nodes.filter(n => !edgeNodes.has(n));

  const nodeBox: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    color: 'var(--text)',
  };

  return (
    <div style={{ color: 'var(--text)', lineHeight: 1.6 }}>
      {description && (
        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 12 }}>{description}</p>
      )}

      {chains.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: orphans.length > 0 ? 12 : 0 }}>
          {chains.map((chain, ci) => (
            <div key={ci} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {chain.map((step, si) => (
                <React.Fragment key={si}>
                  <span style={nodeBox} title={step.label}>{step.label}</span>
                  {si < chain.length - 1 && (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)', fontSize: 11, gap: 1 }}>
                      {step.edgeLabel && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                          {step.edgeLabel}
                        </span>
                      )}
                      <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <div>
          {chains.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Nodes
            </span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orphans.map((node, i) => (
              <span key={i} style={nodeBox}>{node}</span>
            ))}
          </div>
        </div>
      )}

      {!description && nodes.length === 0 && edges.length === 0 && (
        <KeyValueFallback data={data} />
      )}
    </div>
  );
}

// ── Mermaid visual ────────────────────────────────────────────────────────────

function MermaidVisual({ data }: { data: Record<string, unknown> }) {
  const chart = typeof data.chart === 'string' ? data.chart : '';
  if (!chart) return <KeyValueFallback data={data} />;
  return <MermaidDiagram chart={chart} />;
}

// ── Shared fallback ───────────────────────────────────────────────────────────

function KeyValueFallback({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)' }}>No data</span>;

  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
      {entries.map(([key, value]) => (
        [
          <dt key={`${key}-k`} style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {key}
          </dt>,
          <dd key={`${key}-v`} style={{ margin: 0, color: 'var(--text-muted)' }}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
          </dd>,
        ]
      ))}
    </dl>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

function thStyle(bg: string): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '6px 10px',
    background: bg,
    borderBottom: '2px solid var(--border)',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    fontSize: 12,
  };
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)',
  verticalAlign: 'top',
  fontSize: 13,
};
