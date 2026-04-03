/**
 * WHY: Settings page — lets users edit their profile and configure preferences.
 *
 * Two sections:
 *   1. Profile — edit name (email shown read-only since BetterAuth manages it).
 *   2. Preferences — toggle between Tasur's custom pen cursor and the system default.
 *
 * Profile updates use BetterAuth's built-in updateUser endpoint. Cursor preference
 * is stored in localStorage and picked up by CustomCursor via a custom event.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, updateUser } from '@/lib/auth-client';

const CURSOR_STORAGE_KEY = 'cursor';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Profile fields
  const [name, setName] = useState('');
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cursor preference
  const [cursorMode, setCursorMode] = useState<'custom' | 'system'>('custom');

  // Populate fields once session loads
  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? '');
    }
  }, [session]);

  // Read cursor preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CURSOR_STORAGE_KEY);
    if (saved === 'system') setCursorMode('system');
    else setCursorMode('custom');
  }, []);

  // ── Profile save ──────────────────────────────────────────────────────────

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileMessage(null);

    const { error } = await updateUser({ name });

    if (error) {
      setProfileMessage({ type: 'error', text: error.message ?? 'Failed to update profile.' });
    } else {
      setProfileMessage({ type: 'success', text: 'Profile updated.' });
      setProfileDirty(false);
    }
    setProfileSaving(false);
  }

  // ── Cursor toggle ─────────────────────────────────────────────────────────

  function handleCursorToggle() {
    const next = cursorMode === 'custom' ? 'system' : 'custom';
    setCursorMode(next);
    localStorage.setItem(CURSOR_STORAGE_KEY, next);
    // Notify CustomCursor in the same tab
    window.dispatchEvent(new Event('cursor-preference-changed'));
  }

  if (isPending) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app-fade-up" style={{ maxWidth: 560, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link
          href="/dashboard"
          style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 12, display: 'inline-block' }}
        >
          ← Back to sessions
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--text)',
            fontFamily: "'Instrument Serif', Georgia, serif",
          }}
        >
          Settings
        </h1>
      </div>

      {/* ── Profile section ──────────────────────────────────────────────── */}
      <section
        className="manuscript-card"
        style={{ borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
          Profile
        </h2>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setProfileDirty(true); setProfileMessage(null); }}
            placeholder="Your name"
            style={inputStyle}
          />
        </div>

        {/* Email — read only */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={session?.user?.email ?? ''}
            disabled
            style={{ ...inputStyle, opacity: 0.6 }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Email cannot be changed.
          </p>
        </div>

        {/* Message */}
        {profileMessage && (
          <p
            style={{
              fontSize: 13,
              marginBottom: 12,
              color: profileMessage.type === 'success' ? '#3D7A5E' : '#C25858',
            }}
          >
            {profileMessage.text}
          </p>
        )}

        {/* Save button */}
        <button
          onClick={handleProfileSave}
          disabled={!profileDirty || profileSaving}
          className="manuscript-button"
          style={{
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            color: '#fff',
            opacity: !profileDirty || profileSaving ? 0.5 : 1,
            cursor: !profileDirty || profileSaving ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            transition: 'opacity 0.15s ease',
          }}
        >
          {profileSaving ? 'Saving...' : 'Save changes'}
        </button>
      </section>

      {/* ── Preferences section ──────────────────────────────────────────── */}
      <section
        className="manuscript-card"
        style={{ borderRadius: 12, padding: '24px 28px' }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
          Preferences
        </h2>

        {/* Cursor toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Custom cursor
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {cursorMode === 'custom'
                ? 'Using the Tasur pen cursor.'
                : 'Using your system default cursor.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCursorToggle}
            className={`upload-toggle${cursorMode === 'custom' ? ' is-on' : ''}`}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: 'none',
              background: cursorMode === 'custom' ? 'var(--primary)' : 'var(--border)',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: cursorMode === 'custom' ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.15s ease',
              }}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 6,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontFamily: 'Inter, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 0',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  borderRadius: 0,
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};
