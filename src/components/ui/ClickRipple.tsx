'use client';

/**
 * WHY: Adds a subtle ripple dot at every click point so users get clear
 * visual confirmation that a click registered — especially useful with the
 * custom cursor where the hotspot isn't the usual arrow tip.
 *
 * Technique: listen for `pointerdown` on the document (fires before click,
 * so it feels instant), create a fixed-position div at the click coordinates,
 * let the CSS animation run, then remove the element.  No React state — DOM
 * nodes are created and destroyed imperatively to stay off the React render
 * path entirely.
 */

import { useEffect, useRef } from 'react';

// Size and colour of the ripple ring
const RIPPLE_SIZE = 28;          // px diameter at peak
const RIPPLE_COLOR = '#944604';  // burnt sienna — matches Tasur CTA amber

// Injected once — lives outside the Tailwind pipeline so it never gets purged
const RIPPLE_CSS = `
@keyframes tasur-ripple {
  0%   { transform: scale(0);   opacity: 0.5; }
  60%  { transform: scale(1);   opacity: 0.2; }
  100% { transform: scale(1.2); opacity: 0;   }
}
.tasur-ripple-dot {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 99998;
  animation: tasur-ripple 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}
`;

export function ClickRipple() {
  const styleInjected = useRef(false);

  useEffect(() => {
    // Inject the ripple styles exactly once into the document head
    if (!styleInjected.current) {
      const style = document.createElement('style');
      style.setAttribute('data-tasur-ripple', 'true');
      style.textContent = RIPPLE_CSS;
      document.head.appendChild(style);
      styleInjected.current = true;
    }

    function onPointerDown(e: PointerEvent) {
      // Only react to primary button (left click / tap), not right-click
      if (e.button !== 0) return;

      const dot = document.createElement('div');
      dot.className = 'tasur-ripple-dot';

      const half = RIPPLE_SIZE / 2;
      dot.style.cssText = `
        width: ${RIPPLE_SIZE}px;
        height: ${RIPPLE_SIZE}px;
        left: ${e.clientX - half}px;
        top: ${e.clientY - half}px;
        background: ${RIPPLE_COLOR};
        transform-origin: center center;
      `;

      document.body.appendChild(dot);

      // Clean up after animation finishes (420 ms + small buffer)
      setTimeout(() => dot.remove(), 500);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return null; // purely side-effect component
}
