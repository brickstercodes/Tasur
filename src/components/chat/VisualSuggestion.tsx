'use client';

/**
 * WHY: Renders inline visual aids that the Concept Explainer agent produces
 * alongside its text response.
 *
 * The explainer's `visual_suggestion` field carries a `type` ('table',
 * 'comparison', 'diagram') and a `data` record. This component translates
 * those structured payloads into readable UI elements without requiring any
 * additional LLM calls — the data is already produced by the explainer.
 *
 * All three visual types render purely from the `data` record:
 *   table      → rows/columns extracted from { headers, rows }
 *   comparison → two-column card from { left, right, attributes[] }
 *   diagram    → fallback text representation from { description, nodes, edges }
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface VisualSuggestionProps {
  type: 'diagram' | 'table' | 'comparison';
  data: Record<string, unknown>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function VisualSuggestion({ type, data }: VisualSuggestionProps) {
  return (
    <div
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

      <div style={{ padding: '12px 16px', background: 'var(--surface-elevated)' }}>
        {type === 'table' && <TableVisual data={data} />}
        {type === 'comparison' && <ComparisonVisual data={data} />}
        {type === 'diagram' && <DiagramVisual data={data} />}
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

  // Support both { attributes, left_values, right_values } and { items: [] } shapes.
  const items = Array.isArray(data.items)
    ? (data.items as Array<{ attribute: string; left: string; right: string }>)
    : buildComparisonItems(data);

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

  return (
    <div style={{ color: 'var(--text)', lineHeight: 1.6 }}>
      {description && (
        <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{description}</p>
      )}

      {nodes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Nodes
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {nodes.map((node, i) => (
              <span
                key={i}
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 12,
                  color: 'var(--text)',
                }}
              >
                {node}
              </span>
            ))}
          </div>
        </div>
      )}

      {edges.length > 0 && (
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Relationships
          </span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {edges.map((edge, i) => (
              <li key={i} style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                <strong>{edge.from}</strong>
                {edge.label ? ` —[${edge.label}]→ ` : ' → '}
                <strong>{edge.to}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!description && nodes.length === 0 && edges.length === 0 && (
        <KeyValueFallback data={data} />
      )}
    </div>
  );
}

// ── Shared fallback ───────────────────────────────────────────────────────────

function KeyValueFallback({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)' }}>No data</span>;

  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
      {entries.map(([key, value]) => (
        <>
          <dt key={`${key}-k`} style={{ fontWeight: 600, color: '#FAFAF7', whiteSpace: 'nowrap' }}>
            {key}
          </dt>
          <dd key={`${key}-v`} style={{ margin: 0, color: '#9A9390' }}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
          </dd>
        </>
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
    borderBottom: '2px solid #3A3835',
    fontWeight: 600,
    color: '#FAFAF7',
    whiteSpace: 'nowrap',
    fontSize: 12,
  };
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #3A3835',
  color: '#9A9390',
  verticalAlign: 'top',
  fontSize: 13,
};
