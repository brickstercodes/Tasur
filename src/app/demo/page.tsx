/**
 * /demo — standalone background screen for product video recordings.
 * Not linked from any nav. Visit directly at /demo before recording.
 * Optimised for 16:9 capture.
 */

import { TasurWordmark } from '@/components/ui/TasurWordmark';

export default function DemoPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Subtle radial glow behind the wordmark */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Fine horizontal rule — top */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '10%',
          left: '8%',
          right: '8%',
          height: '1px',
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 25%, transparent), transparent)',
        }}
      />

      {/* Fine horizontal rule — bottom */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '8%',
          right: '8%',
          height: '1px',
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 25%, transparent), transparent)',
        }}
      />

      {/* Corner marks — top-left */}
      <div aria-hidden style={{ position: 'absolute', top: '9.6%', left: '7.8%', width: 10, height: 10, borderTop: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderLeft: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)' }} />
      {/* Corner marks — top-right */}
      <div aria-hidden style={{ position: 'absolute', top: '9.6%', right: '7.8%', width: 10, height: 10, borderTop: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderRight: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)' }} />
      {/* Corner marks — bottom-left */}
      <div aria-hidden style={{ position: 'absolute', bottom: '9.6%', left: '7.8%', width: 10, height: 10, borderBottom: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderLeft: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)' }} />
      {/* Corner marks — bottom-right */}
      <div aria-hidden style={{ position: 'absolute', bottom: '9.6%', right: '7.8%', width: 10, height: 10, borderBottom: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)', borderRight: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)' }} />

      {/* Main content */}
      <div style={{ position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <TasurWordmark size={96} />

        <div
          style={{
            width: 40,
            height: 1,
            background: 'color-mix(in srgb, var(--primary) 50%, transparent)',
          }}
        />

        <p
          style={{
            margin: 0,
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '1.35rem',
            color: 'var(--text-muted)',
            letterSpacing: '-0.01em',
          }}
        >
          Your Study, Refined by Intelligence.
        </p>
      </div>

      {/* Bottom label */}
      <div
        style={{
          position: 'absolute',
          bottom: '12%',
          fontFamily: 'var(--font-geist-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'color-mix(in srgb, var(--primary) 55%, transparent)',
        }}
      >
        tasur.anugrahshetty.dev
      </div>
    </div>
  );
}
