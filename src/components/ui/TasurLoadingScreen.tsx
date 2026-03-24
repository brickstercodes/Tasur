/**
 * WHY: Shared branded loading screen used by every Next.js loading.tsx segment.
 *
 * Extracted from the original study/[sessionId]/loading.tsx so that mindmap,
 * chat, flashcards, and dashboard segments all show the same experience instead
 * of a blank "Rendering…" wait. Server-component safe — no hooks, no 'use client'.
 */

import { TasurWordmark } from '@/components/ui/TasurWordmark';

export function TasurLoadingScreen() {
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
        gap: 24,
        zIndex: 9999,
      }}
    >
      <style>{`
        @keyframes tasur-fade-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }
        @keyframes tasur-bar-grow {
          0%   { width: 0%; opacity: 0.5; }
          60%  { width: 70%; opacity: 1; }
          100% { width: 92%; opacity: 0.8; }
        }
        .tasur-loading-mark {
          animation: tasur-fade-pulse 2s ease-in-out infinite;
        }
        .tasur-loading-bar {
          animation: tasur-bar-grow 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

      <div className="tasur-loading-mark">
        <TasurWordmark size={36} color="var(--logo)" />
      </div>

      {/* Thin progress bar */}
      <div
        style={{
          width: 160,
          height: 1.5,
          background: 'var(--border)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          className="tasur-loading-bar"
          style={{
            height: '100%',
            background: 'var(--primary)',
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}
