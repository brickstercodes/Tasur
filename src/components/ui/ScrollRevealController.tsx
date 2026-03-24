'use client';

import { useEffect } from 'react';

export function ScrollRevealController() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
    if (!elements.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
