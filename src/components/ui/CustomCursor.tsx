'use client';

/**
 * WHY: Replaces the browser's native cursor with the Tasur nib SVG.
 *
 * Reads the user's cursor preference from localStorage ('cursor' key).
 * Default is 'custom' (Tasur pen). Users can switch to 'system' via Settings.
 *
 * `cursor: none` is injected dynamically (not in globals.css) so it only
 * applies when the custom cursor is active.
 *
 * Two past bugs fixed here:
 *
 * 1. useState(true) default caused cursor:none to flash in before localStorage
 *    was read, and if cleanup ever failed (HMR, StrictMode), the stale style
 *    lingered with no recovery path → native cursor disappeared even when OFF.
 *    Fix: start with null ("not yet loaded") and only act once preference is known.
 *
 * 2. document.head.appendChild put our style BEFORE any later-injected styles
 *    (Next.js CSS-in-JS, etc.). Two !important rules at equal specificity are
 *    won by the LAST one in the cascade, so those later styles re-enabled the
 *    native cursor even while the custom cursor was ON.
 *    Fix: append to document.body so our rule is always last.
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
  // null = preference not yet loaded; avoids injecting cursor:none before we know.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Default is OFF for new users — only enable if explicitly set to 'custom'
    setEnabled(saved === 'custom');
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
      setEnabled(val === 'custom');
    }
    window.addEventListener('cursor-preference-changed', onCustom);

    // Temporarily disable during driver.js tour so the cursor doesn't hide
    // behind the tour overlay. Restores from localStorage when tour ends.
    function onTourStart() { setEnabled(false); }
    function onTourEnd() {
      const val = localStorage.getItem(STORAGE_KEY);
      setEnabled(val === 'custom');
    }
    window.addEventListener('tasur-tour-start', onTourStart);
    window.addEventListener('tasur-tour-end', onTourEnd);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cursor-preference-changed', onCustom);
      window.removeEventListener('tasur-tour-start', onTourStart);
      window.removeEventListener('tasur-tour-end', onTourEnd);
    };
  }, []);

  useEffect(() => {
    // Still loading preference — do nothing yet.
    if (enabled === null) return;

    // When disabled: sweep out any stale cursor:none styles that might have
    // survived a failed cleanup (HMR reload, StrictMode double-invoke, etc.).
    if (!enabled) {
      document
        .querySelectorAll<HTMLStyleElement>('[data-custom-cursor-lock]')
        .forEach(el => el.remove());
      return;
    }

    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hasFinePointer) return;

    // Append to <body> (not <head>) so this rule sits LAST in the cascade.
    // Any stylesheet injected into <head> after page load will come before
    // this one, meaning our !important wins the tie-break.
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-custom-cursor-lock', 'true');
    styleEl.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.body.appendChild(styleEl);

    let zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    let frameId: number | null = null;
    let lastX = -100;
    let lastY = -100;

    function updateCursorPosition() {
      if (elRef.current) {
        elRef.current.style.transform = `translate(${lastX - TIP_OFFSET_X}px, ${lastY - TIP_OFFSET_Y}px)`;
      }
      frameId = null;
    }

    function hideCursor() {
      if (frameId) cancelAnimationFrame(frameId);
      if (elRef.current) {
        elRef.current.style.opacity = '0';
        elRef.current.style.transform = `translate(${-100 - TIP_OFFSET_X}px, ${-100 - TIP_OFFSET_Y}px)`;
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (elRef.current) {
        elRef.current.style.opacity = '1';
        lastX = e.clientX / zoom;
        lastY = e.clientY / zoom;
        if (!frameId) {
          frameId = requestAnimationFrame(updateCursorPosition);
        }
      }
    }

    function onMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) {
        hideCursor();
      }
    }

    function updateZoom() {
      zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('blur', hideCursor);
    document.addEventListener('visibilitychange', hideCursor);
    window.addEventListener('resize', updateZoom);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('blur', hideCursor);
      document.removeEventListener('visibilitychange', hideCursor);
      window.removeEventListener('resize', updateZoom);
      styleEl.remove();
    };
  }, [enabled]);

  if (enabled === null || !enabled) return null;

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
