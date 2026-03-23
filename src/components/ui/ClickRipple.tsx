'use client';

/**
 * WHY: Adds a parchment-style ink-drop animation at every click point.
 * A central ink bloom plus small scatter droplets give a quill-on-manuscript feel.
 * Coordinates are divided by CSS zoom (set on :root) to match the zoomed layout space.
 */

import { useEffect, useRef } from 'react';

const INK_CSS = `
@keyframes tasur-ink-bloom {
  0%   { transform: scale(0.2); opacity: 0.85; filter: blur(0px); }
  40%  { transform: scale(1);   opacity: 0.55; filter: blur(0.5px); }
  100% { transform: scale(1.6); opacity: 0;    filter: blur(1.5px); }
}
@keyframes tasur-ink-drop {
  0%   { transform: translate(0,0) scale(1);   opacity: 0.75; }
  60%  { opacity: 0.4; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.3); opacity: 0; }
}
.tasur-ink-bloom {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 99998;
  animation: tasur-ink-bloom 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
.tasur-ink-drop {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 99998;
  animation: tasur-ink-drop 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
`;

// Scatter droplets: [angle in deg, distance in px, size in px]
const DROPS: [number, number, number][] = [
  [  15, 18, 3.5 ],
  [ 100, 14, 2.5 ],
  [ 200, 20, 3   ],
  [ 290, 13, 2   ],
  [ 155, 10, 2   ],
];

export function ClickRipple() {
  const styleInjected = useRef(false);

  useEffect(() => {
    if (!styleInjected.current) {
      const style = document.createElement('style');
      style.setAttribute('data-tasur-ink', 'true');
      style.textContent = INK_CSS;
      document.head.appendChild(style);
      styleInjected.current = true;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;

      // Correct for CSS zoom: 1.12 on :root scales the layout space but
      // clientX/clientY are in unscaled viewport pixels.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const x = e.clientX / zoom;
      const y = e.clientY / zoom;

      // Central ink bloom
      const bloom = document.createElement('div');
      bloom.className = 'tasur-ink-bloom';
      bloom.style.cssText = `
        width: 12px; height: 12px;
        left: ${x - 6}px; top: ${y - 6}px;
        background: radial-gradient(circle, #5c2a08 0%, #944604 55%, transparent 100%);
        transform-origin: center;
      `;
      document.body.appendChild(bloom);

      // Scatter droplets
      for (const [angleDeg, dist, size] of DROPS) {
        const rad = (angleDeg * Math.PI) / 180;
        const tx = Math.round(Math.cos(rad) * dist);
        const ty = Math.round(Math.sin(rad) * dist);
        const half = size / 2;

        const drop = document.createElement('div');
        drop.className = 'tasur-ink-drop';
        drop.style.cssText = `
          width: ${size}px; height: ${size}px;
          left: ${x - half}px; top: ${y - half}px;
          background: #6b3210;
          --tx: ${tx}px; --ty: ${ty}px;
          transform-origin: center;
        `;
        document.body.appendChild(drop);
        setTimeout(() => drop.remove(), 600);
      }

      setTimeout(() => bloom.remove(), 700);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return null;
}
