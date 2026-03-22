'use client';

/**
 * WHY: Replaces the browser's native cursor with the Tasur nib SVG.
 * `cursor: none` lives in globals.css so it applies from the very first
 * paint — no JS hydration delay, no double-cursor flicker when moving
 * between browser chrome and page content.
 */

import { useEffect, useRef } from 'react';

// How fast the cursor catches up to the mouse.
// 0.10 = gentle float  |  0.5 = snappy but still smooth  |  1.0 = instant
const LERP_FACTOR = 0.7;

// Display size in px — the SVG is 2048×2048 so we scale it down.
const CURSOR_SIZE = 50;

// Nib tip offset within the rendered image (measured via canvas pixel analysis).
// Subtracting these aligns the visual tip with the actual mouse click point.
const TIP_OFFSET_X = 19;
const TIP_OFFSET_Y = 15;

export function CustomCursor() {
  const elRef = useRef<HTMLImageElement>(null);

  const targetX = useRef(0);
  const targetY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const rafId = useRef<number>(0);
  const started = useRef(false);

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

      started.current = false;
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
    }

    function onMouseMove(e: MouseEvent) {
      forceHideCursorOnTarget(e.target);

      targetX.current = e.clientX;
      targetY.current = e.clientY;

      if (elRef.current) {
        elRef.current.style.opacity = '1';
      }

      if (!started.current) {
        currentX.current = e.clientX;
        currentY.current = e.clientY;
        started.current = true;
        tick();
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

    function tick() {
      currentX.current += (targetX.current - currentX.current) * LERP_FACTOR;
      currentY.current += (targetY.current - currentY.current) * LERP_FACTOR;

      if (elRef.current) {
        elRef.current.style.transform =
          `translate(${currentX.current - TIP_OFFSET_X}px, ${currentY.current - TIP_OFFSET_Y}px)`;
      }

      rafId.current = requestAnimationFrame(tick);
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
      cancelAnimationFrame(rafId.current);
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
