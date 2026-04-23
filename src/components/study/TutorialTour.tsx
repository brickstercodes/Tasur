'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'tasur_tour_v1_done';

export function TutorialTour() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    let destroyed = false;

    // driver.js is browser-only — dynamic import keeps it out of the SSR bundle.
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
          localStorage.setItem(STORAGE_KEY, '1');
        },
        steps: [
          {
            // No element — centered welcome popover.
            popover: {
              title: 'Welcome to Tasur',
              description:
                'Your notes have been transformed into an interactive study experience. This quick tour shows you how to use it.',
              side: 'over',
              align: 'center',
            },
          },
          {
            element: '#mindmap-canvas',
            popover: {
              title: 'Your concept map',
              description:
                'Every node is a concept extracted from your notes. The connections show how they relate to each other.',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '#mindmap-toolbar',
            popover: {
              title: 'Navigation toolbar',
              description:
                'Zoom in/out, fit the map to screen, search for a concept, or hit Continue to pick up from your last chat.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '.study-tabs-row',
            popover: {
              title: 'Mindmap & Flashcards',
              description:
                'Switch to Flashcards for spaced-repetition review. Tasur tracks your confidence on each concept and surfaces the ones you need most.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#mindmap-canvas',
            popover: {
              title: 'Chat with the AI tutor',
              description:
                'Tap any concept node to open a 1-on-1 study chat. The AI knows your notes and will teach, quiz, or clarify — depending on your learning mode.',
              side: 'top',
              align: 'center',
            },
          },
          {
            popover: {
              title: "You're all set",
              description:
                'Explore this walkthrough session, then head back to the dashboard and upload your own notes to get started.',
              side: 'over',
              align: 'center',
            },
          },
        ],
      });

      // Small delay so the mindmap has time to finish rendering before we highlight it.
      const t = window.setTimeout(() => {
        if (!destroyed) driverObj.drive();
      }, 1200);

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
