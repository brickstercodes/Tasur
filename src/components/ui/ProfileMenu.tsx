'use client';

/**
 * WHY: Profile avatar that replaces the email + sign-out button in the header.
 *
 * Renders a 30px circle with the user's first initial (consistent colour from
 * the same AVATAR_COLORS palette used in the chat view). On click it opens a
 * minimal dropdown with the user's email and a Sign out link — keeping the
 * header clean while the action is still accessible.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

// Same warm palette as chat avatars so the colour is consistent per initial.
const AVATAR_COLORS = [
  '#C2692A', '#3B5E8C', '#3D7A5E', '#7A6C2A',
  '#6B4E8A', '#9B5C4A', '#944604', '#2E6B8A',
];

function colorForInitial(initial: string): string {
  return AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
}

interface ProfileMenuProps {
  initial: string;
  email: string;
}

export function ProfileMenu({ initial, email }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push('/login');
  }

  const bg = colorForInitial(initial);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Avatar circle */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: bg,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          fontSize: 12,
          color: '#fff',
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}
      >
        {initial}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            background: 'var(--dropdown-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 0',
            minWidth: 180,
            boxShadow: '0 8px 32px rgba(28,25,23,0.10)',
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: '4px 16px 10px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                fontFamily: 'Inter, sans-serif',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '7px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--sign-out)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
