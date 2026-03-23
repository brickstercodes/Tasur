'use client';

/**
 * WHY: Animated SVG mindmap that mimics the real Tasur mindmap UI.
 * Used in the hero section of the landing page to give visitors a preview
 * of the product. Client component so hover states work.
 */

import { useState } from 'react';

type NodeId = 'root' | 'sync' | 'clock' | 'logical' | 'mutex' | 'election';

const NODES: { id: NodeId; label: string; x: number; y: number; confidence: 'mastered' | 'reviewing' | 'struggling'; children: number }[] = [
  { id: 'root',     label: 'Unit 3: Synchronization\nin Distributed Systems', x: 340, y: 220, confidence: 'reviewing', children: 0 },
  { id: 'sync',     label: '1. Introduction to\nSynchronization',            x: 560, y: 95,  confidence: 'reviewing', children: 6 },
  { id: 'clock',    label: '2. Physical Clock\nSynchronization',              x: 560, y: 210, confidence: 'mastered',  children: 7 },
  { id: 'logical',  label: '3. Logical Clocks &\nEvent Ordering',             x: 560, y: 325, confidence: 'struggling',children: 3 },
  { id: 'mutex',    label: '4. Mutual Exclusion\nAlgorithms',                 x: 100, y: 160, confidence: 'reviewing', children: 8 },
  { id: 'election', label: '5. Election\nAlgorithms',                         x: 110, y: 285, confidence: 'struggling', children: 3 },
];

const CONFIDENCE_COLOR: Record<string, string> = {
  mastered: '#3D7A5E',
  reviewing: '#C2692A',
  struggling: '#9B4A3A',
};

const BUBBLE_COLOR: Record<string, string> = {
  mastered: '#1E4035',
  reviewing: '#5A2E00',
  struggling: '#4A2020',
};

const EDGES: [NodeId, NodeId][] = [
  ['root', 'sync'],
  ['root', 'clock'],
  ['root', 'logical'],
  ['root', 'mutex'],
  ['root', 'election'],
];

function cubicBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function NodeBox({
  node,
  hovered,
  onHover,
}: {
  node: (typeof NODES)[0];
  hovered: boolean;
  onHover: (id: NodeId | null) => void;
}) {
  const isRoot = node.id === 'root';
  const lines = node.label.split('\n');
  const w = isRoot ? 168 : 148;
  const h = isRoot ? 52 : 52;
  const x = node.x - w / 2;
  const y = node.y - h / 2;

  return (
    <g
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'default' }}
    >
      {/* Hover glow */}
      {hovered && (
        <rect
          x={x - 3} y={y - 3} width={w + 6} height={h + 6}
          rx={isRoot ? 14 : 20}
          fill="none"
          stroke="#C2692A"
          strokeWidth="1.5"
          opacity="0.5"
        />
      )}
      {/* Node background */}
      <rect
        x={x} y={y} width={w} height={h}
        rx={isRoot ? 12 : 20}
        fill={isRoot ? '#1C1917' : '#2C2B29'}
        style={{ transition: 'fill 0.15s' }}
      />
      {/* Confidence dot */}
      {!isRoot && (
        <circle
          cx={x + 14}
          cy={node.y}
          r={3.5}
          fill={CONFIDENCE_COLOR[node.confidence]}
        />
      )}
      {/* Label */}
      {lines.map((line, i) => (
        <text
          key={i}
          x={isRoot ? node.x : node.x + (node.children > 0 ? -8 : 6)}
          y={node.y + (lines.length === 1 ? 5 : i * 16 - 6)}
          textAnchor="middle"
          fontSize={isRoot ? 11 : 10.5}
          fontFamily="'Instrument Serif', Georgia, serif"
          fill="#FAFAF7"
          opacity={0.92}
        >
          {line}
        </text>
      ))}
      {/* Children bubble */}
      {node.children > 0 && (
        <g>
          <circle
            cx={x + w + 10}
            cy={node.y}
            r={11}
            fill={BUBBLE_COLOR[node.confidence]}
          />
          <text
            x={x + w + 10}
            y={node.y + 4}
            textAnchor="middle"
            fontSize={8}
            fontFamily="Inter, sans-serif"
            fontWeight="600"
            fill={CONFIDENCE_COLOR[node.confidence]}
          >
            +{node.children}
          </text>
        </g>
      )}
    </g>
  );
}

export function LandingMindmapPreview() {
  const [hovered, setHovered] = useState<NodeId | null>(null);

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, (typeof NODES)[0]>;

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/10',
        background: '#18171A',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}
    >
      {/* Fake toolbar */}
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(28,25,23,0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: '24px',
        padding: '6px 14px',
        zIndex: 2,
      }}>
        <span style={{ color: '#554339', fontSize: 13, fontFamily: 'monospace' }}>−</span>
        <span style={{ color: '#554339', fontSize: 13, fontFamily: 'monospace', marginLeft: 6 }}>+</span>
        <div style={{ width: 1, height: 14, background: '#3A3835', margin: '0 4px' }} />
        <span style={{ color: '#554339', fontSize: 11, fontFamily: 'monospace', marginLeft: 4 }}>⊡</span>
        <span style={{ color: '#554339', fontSize: 11, fontFamily: 'monospace', marginLeft: 4 }}>⊞</span>
        <div style={{ flex: 1 }} />
        <div style={{
          background: '#C2692A', color: '#fff', fontSize: 11,
          fontFamily: 'Inter, sans-serif', fontWeight: 600,
          borderRadius: 24, padding: '4px 14px',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span>▶</span> Continue
        </div>
        <div style={{
          border: '1px solid #3A3835', color: '#C2692A', fontSize: 10,
          fontFamily: 'Inter, sans-serif', fontWeight: 600,
          borderRadius: 24, padding: '4px 10px',
          letterSpacing: '0.05em',
        }}>
          ⚡ FAST
        </div>
      </div>

      {/* Mindmap SVG */}
      <svg
        viewBox="0 0 740 420"
        style={{ width: '100%', height: '100%', paddingTop: 40 }}
      >
        {/* Edges */}
        {EDGES.map(([from, to]) => {
          const f = nodeMap[from];
          const t = nodeMap[to];
          const isRight = t.x > f.x;
          const fx = isRight ? f.x + 84 : f.x - 84;
          const tx = isRight ? t.x - 74 : t.x + 74;
          return (
            <path
              key={`${from}-${to}`}
              d={cubicBezierPath(fx, f.y, tx, t.y)}
              stroke="#D4CFC5"
              strokeWidth="1"
              strokeOpacity="0.25"
              fill="none"
            />
          );
        })}
        {/* Nodes */}
        {NODES.map((node) => (
          <NodeBox
            key={node.id}
            node={node}
            hovered={hovered === node.id}
            onHover={setHovered}
          />
        ))}
      </svg>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        {[
          { color: '#3D7A5E', label: 'Mastered' },
          { color: '#C2692A', label: 'Reviewing' },
          { color: '#9B4A3A', label: 'Struggling' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 9, color: '#9A9390', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
