'use client';

/**
 * WHY: Client component for the Mindmap / Flashcards tab links.
 *
 * Needs to be a client component so it can call usePathname() to determine
 * which tab is currently active and apply the stitch underline-active style.
 *
 * Active tab:   bold, #944604, 2px bottom border in #944604
 * Inactive tab: #887367, no underline, normal weight
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface StudyTabsProps {
  sessionId: string;
}

export function StudyTabs({ sessionId }: StudyTabsProps) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Mindmap',    href: `/study/${sessionId}/mindmap` },
    { label: 'Flashcards', href: `/study/${sessionId}/flashcards` },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      {tabs.map(({ label, href }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={label}
            href={href}
            style={{
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#944604' : '#887367',
              textDecoration: 'none',
              paddingBottom: 2,
              borderBottom: isActive ? '2px solid #944604' : '2px solid transparent',
              fontFamily: 'Inter, sans-serif',
              letterSpacing: isActive ? '-0.01em' : undefined,
              transition: 'color 0.12s ease, border-color 0.12s ease',
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
