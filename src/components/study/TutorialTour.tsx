'use client';

import { useEffect } from 'react';
import type { DriveStep } from 'driver.js';

interface TutorialTourProps {
  steps: DriveStep[];
  delayMs?: number;
}

export function TutorialTour({ steps, delayMs = 1200 }: TutorialTourProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let destroyed = false;

    import('driver.js').then(({ driver }) => {
      if (destroyed) return;

      const driverObj = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'tasur-tour-popover',
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: "Let's go!",
        onDestroyed: () => {
          document.body.removeAttribute('data-tour-active');
          window.dispatchEvent(new Event('tasur-tour-end'));
        },
        steps,
      });

      const t = window.setTimeout(() => {
        if (!destroyed) {
          document.body.setAttribute('data-tour-active', 'true');
          window.dispatchEvent(new Event('tasur-tour-start'));
          driverObj.drive();
        }
      }, delayMs);

      return () => {
        destroyed = true;
        window.clearTimeout(t);
        driverObj.destroy();
      };
    });

    return () => {
      destroyed = true;
    };
  }, []);

  return null;
}
