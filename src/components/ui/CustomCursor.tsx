'use client';

/**
 * WHY: Replaces the browser's native cursor with the Tasur nib SVG.
 * `cursor: none` lives in globals.css so it applies from the very first
 * paint — no JS hydration delay, no double-cursor flicker when moving
 * between browser chrome and page content.
 */

import { useEffect, useRef } from 'react';

// Display size in px — the SVG is 2048×2048 so we scale it down.
const CURSOR_SIZE = 70;

// Nib tip offset within the rendered image (measured via canvas pixel analysis).
// Subtracting these aligns the visual tip with the actual mouse click point.
const TIP_OFFSET_X = 19;
const TIP_OFFSET_Y = 15;

export function CustomCursor() {
  const elRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hasFinePointer) {
      return;
    }

    // Keep this rule last in the cascade so late-loaded styles can't re-enable native cursors.
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-custom-cursor-lock', 'true');
    styleEl.textContent = '* { cursor: none !important; }';
    document.head.appendChild(styleEl);

    function forceHideCursorOnTarget(target: EventTarget | null) {
      if (target instanceof HTMLElement || target instanceof SVGElement) {
        target.style.setProperty('cursor', 'none', 'important');
      }
    }

    function hideCursor() {
      if (elRef.current) {
        elRef.current.style.opacity = '0';
        elRef.current.style.transform = `translate(${-100 - TIP_OFFSET_X}px, ${-100 - TIP_OFFSET_Y}px)`;
      }
    }

    function onMouseMove(e: MouseEvent) {
      forceHideCursorOnTarget(e.target);

      if (elRef.current) {
        // CSS zoom on :root scales the layout coordinate system but clientX/clientY
        // are in unscaled viewport pixels — divide to correct the mismatch.
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const x = e.clientX / zoom;
        const y = e.clientY / zoom;
        elRef.current.style.opacity = '1';
        elRef.current.style.transform = `translate(${x - TIP_OFFSET_X}px, ${y - TIP_OFFSET_Y}px)`;
      }
    }

    function onMouseOut(e: MouseEvent) {
      // When relatedTarget is null, pointer left the document/viewport.
      if (!e.relatedTarget) {
        hideCursor();
      }
    }

    function onMouseOver(e: MouseEvent) {
      forceHideCursorOnTarget(e.target);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('blur', hideCursor);
    document.addEventListener('visibilitychange', hideCursor);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('blur', hideCursor);
      document.removeEventListener('visibilitychange', hideCursor);
      styleEl.remove();
    };
  }, []);

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
