/**
 * WHY: Shown by Next.js App Router (via React Suspense) while the study session
 * layout + page are being fetched/rendered on the server. This replaces the blank
 * white wait with a calm, branded holding screen so the user knows the click
 * registered and the app is working.
 */

import { TasurWordmark } from '@/components/ui/TasurWordmark';

export default function StudySessionLoading() {
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
