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
        width: 34,
        height: 34,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textDecoration: 'none',
        flexShrink: 0,
        letterSpacing: '0.01em',
        fontFamily: 'Inter, sans-serif',
        borderRadius: 999,
        border: '1px solid color-mix(in srgb, var(--border) 86%, transparent)',
        background: 'transparent',
        transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease',
      }}
      aria-label={isChatRoute ? 'Back to mindmap' : 'Back to dashboard'}
      title={isChatRoute ? 'Back to mindmap' : 'Back to dashboard'}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = 'var(--tab-hover)';
        el.style.borderColor = 'var(--border-hover)';
        el.style.color = 'var(--text)';
        el.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = 'transparent';
        el.style.borderColor = 'color-mix(in srgb, var(--border) 86%, transparent)';
        el.style.color = 'var(--text-muted)';
        el.style.transform = 'translateY(0)';
      }}
    >
      &larr;
    </Link>
  );
}
