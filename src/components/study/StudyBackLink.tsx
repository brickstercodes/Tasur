'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface StudyBackLinkProps {
  sessionId: string;
}

export function StudyBackLink({ sessionId }: StudyBackLinkProps) {
  const pathname = usePathname();
  const isChatRoute = pathname.includes(`/study/${sessionId}/chat`);
  const href = isChatRoute ? `/study/${sessionId}/mindmap` : '/dashboard';

  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        textDecoration: 'none',
        flexShrink: 0,
        letterSpacing: '0.01em',
        fontFamily: 'Inter, sans-serif',
      }}
      aria-label={isChatRoute ? 'Back to mindmap' : 'Back to dashboard'}
      title={isChatRoute ? 'Back to mindmap' : 'Back to dashboard'}
    >
      &larr;
    </Link>
  );
}
