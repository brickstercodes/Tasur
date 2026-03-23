'use client';

/**
 * WHY: Sun/moon toggle button that switches between light and dark themes.
 *
 * Uses the ThemeContext so the theme state is shared globally — any part of
 * the app can read the current theme or trigger a toggle. Placed in the
 * dashboard header alongside ProfileMenu.
 */

import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '4px 12px',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '13px',
        fontFamily: "'Instrument Serif', Georgia, serif",
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'border-color 0.15s ease, color 0.15s ease',
      }}
    >
      {theme === 'light' ? '☾ Dark' : '☀ Light'}
    </button>
  );
}
