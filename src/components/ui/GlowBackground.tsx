'use client';

import { useTheme } from '@/contexts/ThemeContext';

export function GlowBackground() {
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9000,
        // dark: screen — additive blend brightens the dark bg with warm amber
        // light: normal at low opacity — warm amber tint sits softly at the top
        mixBlendMode: isDark ? 'screen' : 'normal',
        background: isDark
          ? 'radial-gradient(ellipse 85% 70% at 50% 10%, var(--glow-color) 0%, transparent 65%)'
          : 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(210,130,50,0.13) 0%, transparent 60%)',
        // Secondary bottom-corner accent for warmth
        WebkitMaskImage: isDark ? undefined : undefined,
      }}
    />
  );
}
