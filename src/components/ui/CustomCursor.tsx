'use client';

/**
 * WHY: Replaces the browser's native cursor with the Tasur nib SVG.
 *
 * Reads the user's cursor preference from localStorage ('cursor' key).
 * Default is 'custom' (Tasur pen). Users can switch to 'system' via Settings.
 *
 * `cursor: none` is injected dynamically (not in globals.css) so it only
 * applies when the custom cursor is active.
 */

import { useEffect, useRef, useState } from 'react';

// Display size in px — the SVG is 2048×2048 so we scale it down.
const CURSOR_SIZE = 70;

// Nib tip offset within the rendered image (measured via canvas pixel analysis).
// Subtracting these aligns the visual tip with the actual mouse click point.
const TIP_OFFSET_X = 19;
const TIP_OFFSET_Y = 15;

const STORAGE_KEY = 'cursor';

export function CustomCursor() {
  const elRef = useRef<HTMLImageElement>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Default is 'custom' — only disable if explicitly set to 'system'
    if (saved === 'system') {
      setEnabled(false);
    }
  }, []);

  // Listen for changes from the settings page (same tab or other tabs)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setEnabled(e.newValue !== 'system');
      }
    }
    window.addEventListener('storage', onStorage);

    // Also listen for custom event (same-tab changes)
    function onCustom() {
      const val = localStorage.getItem(STORAGE_KEY);
      setEnabled(val !== 'system');
    }
    window.addEventListener('cursor-preference-changed', onCustom);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cursor-preference-changed', onCustom);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hasFinePointer) return;

    // Keep this rule last in the cascade so late-loaded styles can't re-enable native cursors.
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-custom-cursor-lock', 'true');
    styleEl.textContent = '* { cursor: none !important; }';
    document.head.appendChild(styleEl);

    function hideCursor() {
      if (elRef.current) {
        elRef.current.style.opacity = '0';
        elRef.current.style.transform = `translate(${-100 - TIP_OFFSET_X}px, ${-100 - TIP_OFFSET_Y}px)`;
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (elRef.current) {
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const x = e.clientX / zoom;
        const y = e.clientY / zoom;
        elRef.current.style.opacity = '1';
        elRef.current.style.transform = `translate(${x - TIP_OFFSET_X}px, ${y - TIP_OFFSET_Y}px)`;
      }
    }

    function onMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) {
        hideCursor();
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('blur', hideCursor);
    document.addEventListener('visibilitychange', hideCursor);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('blur', hideCursor);
      document.removeEventListener('visibilitychange', hideCursor);
      styleEl.remove();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={elRef}
      src="/cursor.svg"
      alt=""
      width={CURSOR_SIZE}
      height={CURSOR_SIZE}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: CURSOR_SIZE,
        height: CURSOR_SIZE,
        transform: 'translate(-100px, -100px)',
        pointerEvents: 'none',
        zIndex: 99999,
        willChange: 'transform',
        userSelect: 'none',
        imageRendering: 'auto',
        opacity: 0,
      }}
    />
  );
}
