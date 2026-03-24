'use client';

/**
 * WHY: Client component for the Mindmap / Flashcards tab links.
 *
 * Needs to be a client component so it can call usePathname() to determine
 * which tab is currently active and apply the premium segmented-tab style.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface StudyTabsProps {
  sessionId: string;
}

export function StudyTabs({ sessionId }: StudyTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const tabs = [
    { label: 'Mindmap',    href: `/study/${sessionId}/mindmap` },
    { label: 'Flashcards', href: `/study/${sessionId}/flashcards` },
  ];

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Tabs live in a persistent layout, so clear the transition veil after route change.
    setIsTransitioning(false);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [pathname]);

  function handleTabClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    isActive: boolean,
  ) {
    if (isActive) {
      event.preventDefault();
      return;
    }

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    setIsTransitioning(true);

    timeoutRef.current = window.setTimeout(() => {
      router.push(href);
    }, 160);
  }

  return (
    <>
      <div
        aria-hidden
        className={`study-route-veil ${isTransitioning ? 'is-visible' : ''}`}
      />
      <div className="study-tabs-row" aria-label="Study views">
      {tabs.map(({ label, href }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={label}
            href={href}
            className={`study-tab-link ${isActive ? 'is-active' : ''}`}
            onClick={(event) => handleTabClick(event, href, isActive)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="study-tab-text">{label}</span>
          </Link>
        );
      })}
      </div>
    </>
  );
}
