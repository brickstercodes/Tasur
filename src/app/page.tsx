/**
 * WHY: Landing page for unauthenticated visitors exploring Tasur.
 *
 * Follows the "Scholarly Canvas" design language — typographic authority,
 * tonal layering (no borders), generous whitespace, and the burnt-sienna
 * primary accent used sparingly to guide the eye.
 */

import Link from 'next/link';
import { TasurWordmark } from '@/components/ui/TasurWordmark';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ScrollRevealController } from '@/components/ui/ScrollRevealController';
import { LandingMindmapPreview } from './LandingMindmapPreview';

// ------------------------------------------------------------------
// Nav
// ------------------------------------------------------------------

function Nav() {
  return (
    <nav
      className="fixed top-0 w-full z-50 backdrop-blur-md"
      style={{
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--primary) 12%, transparent)',
      }}
    >
      <div className="max-w-screen-xl mx-auto px-8 md:px-12 py-4 flex items-center justify-between relative">
        {/* Logo */}
        <Link href="/" className="select-none">
          <TasurWordmark size={24} />
        </Link>

        {/* Nav Links (desktop) — absolutely centered */}
        <div className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2">
          {[
            { label: 'Philosophy', href: '#philosophy' },
            { label: 'Methodology', href: '#methodology' },
            { label: 'Library', href: '#library' },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="landing-nav-link"
              style={{
                fontFamily: 'var(--font-instrument-serif)',
                fontSize: '1.05rem',
                letterSpacing: '-0.01em',
              }}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Right: theme toggle + auth CTAs */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden sm:block text-sm font-semibold transition-colors duration-200 px-4 py-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold px-5 py-2.5 transition-all duration-200 hover:opacity-90"
            style={{
              background: 'var(--primary)',
              color: '#ffffff',
              borderRadius: '3px',
            }}
          >
            Begin Study
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------
// Hero
// ------------------------------------------------------------------

function Hero() {
  return (
    <section data-scroll-reveal className="reveal-delay-1 max-w-screen-xl mx-auto px-8 md:px-12 pt-36 pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left — Copy */}
        <div className="lg:col-span-6 flex flex-col">
          <span
            className="text-xs font-bold tracking-[0.2em] uppercase mb-7"
            style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}
          >
            Introduction
          </span>
          <h1
            className="leading-[0.88] tracking-tight mb-8"
            style={{
              fontFamily: 'var(--font-instrument-serif)',
              fontSize: 'clamp(3rem, 7vw, 5.5rem)',
              color: 'var(--text)',
            }}
          >
            Your Study,
            <br />
            Refined by{' '}
            <em style={{ color: 'var(--primary)', fontStyle: 'italic' }}>
              Intelligence.
            </em>
          </h1>
            <p
            className="landing-body-text text-lg leading-relaxed mb-10 max-w-lg font-bold"
            style={{ color: 'var(--text-muted)', letterSpacing: '-0.011em' }}
            >
            Tasur transforms your notes into interactive mindmaps and
            personalized tutoring sessions for deep, focused learning. The
            sanctuary for your intellectual growth.
            </p>
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/signup"
              className="px-8 py-4 text-base font-bold transition-all duration-200 hover:opacity-90 hover:shadow-xl"
              style={{
                background: 'var(--primary)',
                color: '#ffffff',
                borderRadius: '3px',
                boxShadow: '0 4px 20px color-mix(in srgb, var(--primary) 30%, transparent)',
              }}
            >
              Begin Your Study
            </Link>
            <Link
              href="/login"
              className="text-base font-bold transition-colors duration-200 border-b border-transparent hover:border-current pb-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Already a member? Sign in →
            </Link>
          </div>
        </div>

        {/* Right — Interactive mindmap preview */}
        <div className="lg:col-span-6 relative">
          <LandingMindmapPreview />
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Scholar's Interface — faithful dashboard mockup
// ------------------------------------------------------------------

function ScholarsInterface() {
  const sessions = [
    { title: 'Unit 3 DC', domain: 'DISTRIBUTED SYSTEMS', mode: 'FAST', mastered: 0, total: 33, ago: '7h ago' },
    { title: 'Neural Networks', domain: 'MACHINE LEARNING', mode: 'STEADY', mastered: 18, total: 41, ago: '2d ago' },
    { title: 'Kant\'s Critique', domain: 'PHILOSOPHY', mode: 'STEADY', mastered: 9, total: 22, ago: '5d ago' },
  ];

  return (
    <section
      id="library"
      data-scroll-reveal
      className="reveal-delay-2 py-28"
      style={{ background: 'var(--surface)' }}
    >
      <div className="max-w-screen-xl mx-auto px-8 md:px-12">
        <div className="mb-16 manuscript-heading">
          <h2
            className="text-5xl mb-4"
            style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}
          >
            The Scholar&apos;s Interface
          </h2>
          <div className="h-0.5 w-20" style={{ background: 'var(--primary)' }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Dashboard mockup — 2 cols */}
          <div
            className="lg:col-span-2 rounded-xl overflow-hidden"
            style={{ background: '#18171A' }}
          >
            {/* Dashboard header */}
            <div className="px-7 pt-6 pb-4 flex items-center justify-between">
              <div>
                <h3 style={{ fontFamily: 'var(--font-instrument-serif)', color: '#FAFAF7', fontSize: 22, fontWeight: 400, margin: 0 }}>
                  Sessions
                </h3>
                <p style={{ color: '#9A9390', fontSize: 12, margin: '3px 0 0', fontFamily: 'Inter, sans-serif' }}>
                  {sessions.length} sessions
                </p>
              </div>
              <div style={{
                background: '#C2692A', color: '#fff', fontSize: 12,
                fontFamily: 'Inter, sans-serif', fontWeight: 600,
                borderRadius: 8, padding: '7px 14px',
              }}>
                New session +
              </div>
            </div>

            {/* Session cards */}
            <div className="px-5 pb-6 space-y-3">
              {sessions.map((s, i) => (
                <div
                  key={i}
                  data-scroll-reveal
                  className={i === 0 ? 'reveal-stagger-1' : i === 1 ? 'reveal-stagger-2' : 'reveal-stagger-3'}
                  style={{
                    background: '#232221',
                    borderRadius: 10,
                    padding: '14px 18px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Title row */}
                  <div className="flex items-center justify-between mb-2">
                    <span style={{
                      fontFamily: 'var(--font-instrument-serif)',
                      color: '#FAFAF7',
                      fontSize: 16,
                      fontWeight: 400,
                    }}>
                      {s.title}
                    </span>
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#9A9390', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>+ doc</span>
                      <span style={{ color: '#C2692A', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Resume →</span>
                      <span style={{
                        border: '1px solid #9B4A3A', color: '#9B4A3A', fontSize: 11,
                        borderRadius: 6, padding: '2px 8px', fontFamily: 'Inter, sans-serif',
                      }}>Delete</span>
                    </div>
                  </div>
                  {/* Tags row */}
                  <div className="flex items-center gap-3 mb-2">
                    <span style={{
                      color: '#78716C', fontSize: 10, letterSpacing: '0.08em',
                      fontFamily: 'var(--font-geist-mono)', textTransform: 'uppercase',
                    }}>
                      {s.domain}
                    </span>
                    <span style={{
                      color: '#C2692A', fontSize: 10, letterSpacing: '0.08em',
                      fontFamily: 'var(--font-geist-mono)',
                    }}>
                      {s.mode === 'FAST' ? '⚡' : '◎'} {s.mode}
                    </span>
                  </div>
                  {/* Stats */}
                  <p style={{ color: '#78716C', fontSize: 12, margin: 0, fontFamily: 'Inter, sans-serif' }}>
                    {s.mastered} of {s.total} concepts · {s.ago}
                  </p>
                  {/* Orange accent line */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 2, background: i === 0 ? '#C2692A' : '#3A3835',
                  }} />
                </div>
              ))}
            </div>
          </div>

          {/* Mindmap preview card */}
          <div
            className="rounded-xl overflow-hidden flex flex-col"
            style={{ background: '#18171A' }}
          >
            <div className="px-6 py-5" style={{ borderBottom: '1px solid #2A2826' }}>
              <h3 style={{ fontFamily: 'var(--font-instrument-serif)', color: '#FAFAF7', fontSize: 18, fontWeight: 400, margin: 0 }}>
                Mindmap View
              </h3>
              <p style={{ color: '#9A9390', fontSize: 12, margin: '3px 0 0', fontFamily: 'Inter, sans-serif' }}>
                Your knowledge, visualized as a tree.
              </p>
            </div>
            {/* Mini mindmap */}
            <div className="flex-1 p-4">
              <svg viewBox="0 0 260 280" style={{ width: '100%', height: '100%' }}>
                {/* Edges */}
                {[
                  [130, 80, 200, 150],
                  [130, 80, 200, 210],
                  [130, 80, 60,  150],
                  [130, 80, 60,  210],
                ].map(([x1,y1,x2,y2], i) => (
                  <path key={i}
                    d={`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`}
                    stroke="#D4CFC5" strokeWidth="0.8" strokeOpacity="0.2" fill="none"
                  />
                ))}
                {/* Root */}
                <rect x={72} y={58} width={116} height={44} rx={10} fill="#1C1917" />
                <text x={130} y={76} textAnchor="middle" fontSize={9} fill="#FAFAF7" fontFamily="'Instrument Serif', serif">Unit 3: Sync in</text>
                <text x={130} y={90} textAnchor="middle" fontSize={9} fill="#FAFAF7" fontFamily="'Instrument Serif', serif">Distributed Systems</text>
                {/* Child nodes */}
                {[
                  { x: 155, y: 150, label: '1. Introduction', dot: '#C2692A' },
                  { x: 155, y: 210, label: '2. Physical Clock', dot: '#3D7A5E' },
                  { x: 20,  y: 150, label: '4. Mutex Algo', dot: '#C2692A' },
                  { x: 20,  y: 210, label: '5. Election', dot: '#9B4A3A' },
                ].map(({ x, y, label, dot }, i) => (
                  <g key={i}>
                    <rect x={x} y={y - 14} width={95} height={28} rx={14} fill="#2C2B29" />
                    <circle cx={x + 11} cy={y} r={3} fill={dot} />
                    <text x={x + 48} y={y + 4} textAnchor="middle" fontSize={8} fill="#FAFAF7" fontFamily="'Instrument Serif', serif">{label}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Conceptual Mapping
// ------------------------------------------------------------------

function ConceptualMapping() {
  return (
    <section data-scroll-reveal className="reveal-delay-1 py-28 max-w-screen-xl mx-auto px-8 md:px-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
        {/* Visual */}
        <div className="lg:col-span-6 order-2 lg:order-1">
          <div className="relative aspect-square max-w-lg mx-auto">
            <div
              className="absolute inset-4 rounded-full blur-3xl opacity-30"
              style={{ background: 'var(--primary)' }}
            />
            <svg className="relative w-full h-full" viewBox="0 0 400 400" fill="none">
              <circle cx="200" cy="200" r="170" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 8" />
              {[
                [200,200,80,110],[200,200,340,95],[200,200,310,310],
                [200,200,60,290],[200,200,200,60],[80,110,200,60],[340,95,200,60],
              ].map(([x1,y1,x2,y2],i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.35" />
              ))}
              {[
                {cx:200,cy:200,r:10,label:'Core'},
                {cx:80,cy:110,r:6,label:'Physics'},
                {cx:340,cy:95,r:6,label:'History'},
                {cx:310,cy:310,r:6,label:'Economy'},
                {cx:60,cy:290,r:6,label:'Ethics'},
                {cx:200,cy:60,r:5,label:''},
              ].map(({cx,cy,r,label},i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={r+4} fill="var(--primary)" fillOpacity="0.1" />
                  <circle cx={cx} cy={cy} r={r} fill="var(--primary)" />
                  {label && (
                    <text x={cx} y={cy-r-8} textAnchor="middle" fontSize="10"
                      fill="var(--text-muted)" fontFamily="var(--font-geist-mono)">
                      {label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Copy */}
        <div className="lg:col-span-5 lg:col-start-8 order-1 lg:order-2">
          <span className="text-xs tracking-[0.2em] uppercase block mb-4 font-bold"
            style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}>
            Feature One
          </span>
          <h2 className="text-6xl leading-tight mb-7"
            style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}>
            Conceptual Mapping
          </h2>
          <p className="landing-body-text text-lg leading-relaxed mb-8 font-bold" style={{ color: 'var(--text-muted)' }}>
            Stop viewing your notes as linear files. Tasur&apos;s engine analyzes
            semantic relationships across your entire library, visualizing how
            distant ideas connect into a cohesive mental model.
          </p>
          <ul className="space-y-4">
            {[
              'Semantic link discovery between isolated notes',
              'Infinite canvas for non-linear exploration',
              'Cross-document concept clustering',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3" style={{ color: 'var(--text)' }}>
                <span style={{ color: 'var(--primary)', marginTop: '2px', flexShrink: 0 }}>◆</span>
                <span className="landing-body-text text-base leading-relaxed font-semibold">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// AI Tutor — faithful two-column chat mockup
// ------------------------------------------------------------------

function AiTutor() {
  return (
    <section
      data-scroll-reveal
      className="reveal-delay-2 py-28"
      style={{ background: 'color-mix(in srgb, var(--surface) 70%, var(--bg))' }}
    >
      <div className="max-w-screen-xl mx-auto px-8 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
        {/* Copy */}
        <div className="lg:col-span-5 lg:pt-8">
          <span className="text-xs tracking-[0.2em] uppercase block mb-4 font-bold"
            style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}>
            Feature Two
          </span>
          <h2 className="text-6xl leading-tight mb-7"
            style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}>
            The AI Tutor
          </h2>
          <p className="landing-body-text text-lg leading-relaxed mb-8 font-bold" style={{ color: 'var(--text-muted)' }}>
            Imagine a brilliant polymath who has read every word you&apos;ve ever
            written. Engage in deep, Socratic dialogues with an AI that
            challenges your assumptions and clarifies complex topics.
          </p>
          <blockquote
            className="p-6 rounded-lg text-xl italic"
            style={{
              fontFamily: 'var(--font-instrument-serif)',
              color: 'var(--text-muted)',
              background: 'var(--bg)',
              borderLeft: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)',
            }}
          >
            &ldquo;How does the concept of entropy in your Physics notes relate
            to the societal decline described in your history thesis?&rdquo;
          </blockquote>
        </div>

        {/* Two-column chat mockup matching the actual app */}
        <div className="lg:col-span-7">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: '#18171A',
              boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            }}
          >
            {/* Breadcrumb / header */}
            <div style={{
              padding: '10px 18px',
              borderBottom: '1px solid #2A2826',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#554339', fontSize: 12 }}>←</span>
                <span style={{ color: '#9A9390', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Dashboard</span>
                <span style={{ color: '#554339', fontSize: 12 }}>›</span>
                <span style={{ color: '#9A9390', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Unit3 DC</span>
                <span style={{ color: '#554339', fontSize: 12 }}>›</span>
                <span style={{ color: '#FAFAF7', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>2. Physical Clock Sync</span>
              </div>
            </div>

            <div style={{ display: 'flex', height: 360 }}>
              {/* Chat column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Concept header */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2826' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      background: '#2A1800', color: '#C2692A', fontSize: 9,
                      fontFamily: 'var(--font-geist-mono)', letterSpacing: '0.08em',
                      borderRadius: 4, padding: '2px 6px',
                    }}>⚡ FAST</span>
                    <span style={{
                      color: '#554339', fontSize: 9,
                      fontFamily: 'var(--font-geist-mono)', letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}>Distributed Systems</span>
                  </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* AI message 1 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#C2692A', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700,
                    }}>T</div>
                    <div style={{
                      background: '#2C2B29', borderRadius: '4px 12px 12px 12px',
                      padding: '10px 12px', fontSize: 12, color: '#FAFAF7',
                      fontFamily: 'Inter, sans-serif', lineHeight: 1.6, maxWidth: 280,
                    }}>
                      In the NTP algorithm, what&apos;s the key tradeoff between accuracy and convergence time when synchronizing clocks across multiple hops?
                    </div>
                  </div>

                  {/* User reply */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'flex-end' }}>
                    <div style={{
                      background: '#2A1800', border: '1px solid rgba(194,105,42,0.25)',
                      borderRadius: '12px 4px 12px 12px',
                      padding: '10px 12px', fontSize: 12, color: '#FAFAF7',
                      fontFamily: 'Inter, sans-serif', lineHeight: 1.6, maxWidth: 260,
                    }}>
                      Each hop adds network delay variance, so accuracy degrades but you need fewer messages than a direct sync...
                    </div>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#2C2B29', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#9A9390', fontFamily: 'Inter, sans-serif',
                    }}>U</div>
                  </div>

                  {/* AI follow-up question */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#C2692A', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 700,
                    }}>T</div>
                    <div style={{
                      background: '#2C2B29', borderRadius: '4px 12px 12px 12px',
                      padding: '10px 12px', fontSize: 12, color: '#FAFAF7',
                      fontFamily: 'Inter, sans-serif', lineHeight: 1.6, maxWidth: 280,
                    }}>
                      Exactly. Now — given that, <span style={{ color: '#C2692A' }}>why does Lamport&apos;s logical clock avoid this problem entirely?</span> Think about what it measures vs. what NTP measures.
                    </div>
                  </div>
                </div>

                {/* Input bar */}
                <div style={{
                  padding: '10px 12px',
                  borderTop: '1px solid #2A2826',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <div style={{
                    flex: 1, background: '#232221', borderRadius: 8,
                    padding: '8px 12px', fontSize: 11, color: '#554339',
                    fontFamily: 'Inter, sans-serif', fontStyle: 'italic',
                  }}>
                    Ask anything about 2. Physical Clock Synchronization...
                  </div>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: '#2C2B29', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#554339', fontSize: 13,
                  }}>↑</div>
                </div>
              </div>

              {/* Focus Zone sidebar */}
              <div style={{
                width: 200, borderLeft: '1px solid #2A2826',
                padding: '14px 14px', overflowY: 'auto',
              }}>
                <div style={{
                  fontFamily: 'var(--font-instrument-serif)',
                  color: '#FAFAF7', fontSize: 14, marginBottom: 4,
                }}>
                  2. Physical Clock Synchronization
                </div>
                <div style={{
                  color: '#C2692A', fontSize: 9, letterSpacing: '0.1em',
                  fontFamily: 'var(--font-geist-mono)', marginBottom: 14,
                }}>
                  ACTIVE FOCUS ZONE
                </div>

                <div style={{ color: '#554339', fontSize: 9, letterSpacing: '0.1em', fontFamily: 'var(--font-geist-mono)', marginBottom: 8 }}>
                  SOURCE NOTES
                </div>
                <div style={{
                  background: '#232221', borderRadius: 8, padding: '10px 10px',
                  fontSize: 10, color: '#9A9390', fontFamily: 'Inter, sans-serif', lineHeight: 1.6,
                }}>
                  <div style={{ color: '#C2692A', fontSize: 9, fontFamily: 'var(--font-geist-mono)', marginBottom: 6 }}>
                    UNIT3_DC.PDF
                  </div>
                  <div style={{ color: '#FAFAF7', fontFamily: 'var(--font-instrument-serif)', fontSize: 13, marginBottom: 4 }}>
                    Unit 3 Synchronization
                  </div>
                  <div style={{ color: '#554339', fontSize: 9 }}>-- 1 of 65 --</div>
                  <div style={{ marginTop: 8, color: '#9A9390' }}>
                    ▪ Introduction<br />
                    ▪ Physical Clock sync<br />
                    ▪ Logical clocks<br />
                    ▪ Lamport&apos;s algorithm<br />
                    ▪ Vector clocks
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Adaptive Flashcards
// ------------------------------------------------------------------

function AdaptiveFlashcards() {
  const cards = [
    {
      icon: '◈',
      title: 'Automatic Generation',
      body: 'Tasur identifies key definitions and concepts within your sessions, drafting high-quality cards instantly.',
      elevated: false,
    },
    {
      icon: '◉',
      title: 'Spaced Repetition',
      body: 'Leveraging scientifically proven intervals to ensure long-term retention of scholarly materials.',
      elevated: true,
    },
    {
      icon: '◎',
      title: 'Precision Mastery',
      body: "Focuses your energy on the concepts you struggle with most, skipping what you've already mastered.",
      elevated: false,
    },
  ];

  return (
    <section data-scroll-reveal className="reveal-delay-1 py-28 max-w-screen-xl mx-auto px-8 md:px-12">
      <div className="text-center mb-20 manuscript-heading">
        <span className="text-xs tracking-[0.2em] uppercase block mb-4 font-bold"
          style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}>
          Feature Three
        </span>
        <h2 className="text-6xl"
          style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}>
          Adaptive Flashcards
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {cards.map(({ icon, title, body, elevated }, index) => (
          <div
            key={title}
            data-scroll-reveal
            className={`p-8 rounded-xl transition-all duration-200 ${
              index === 0
                ? 'reveal-stagger-1'
                : index === 1
                  ? 'reveal-stagger-2'
                  : 'reveal-stagger-3'
            }`}
            style={{
              background: elevated ? 'var(--bg)' : 'var(--surface)',
              marginTop: elevated ? '-2rem' : '0',
              boxShadow: elevated
                ? '0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent)'
                : 'none',
            }}
          >
            <div
              className="w-11 h-11 flex items-center justify-center rounded-sm mb-6 text-xl"
              style={{
                background: elevated
                  ? 'var(--primary)'
                  : 'color-mix(in srgb, var(--primary) 12%, transparent)',
                color: elevated ? '#ffffff' : 'var(--primary)',
              }}
            >
              {icon}
            </div>
            <h4 className="text-2xl mb-4"
              style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}>
              {title}
            </h4>
            <p className="landing-body-text text-base leading-relaxed font-bold" style={{ color: 'var(--text-muted)' }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Philosophy
// ------------------------------------------------------------------

function Philosophy() {
  return (
    <section
      id="philosophy"
      data-scroll-reveal
      className="reveal-delay-1 py-28"
      style={{ background: 'var(--surface)' }}
    >
      <div className="max-w-screen-xl mx-auto px-8 md:px-12">
        <div className="max-w-3xl mx-auto text-center mb-20 manuscript-heading">
          <span
            className="text-xs font-bold tracking-[0.2em] uppercase block mb-4"
            style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}
          >
            Why We Exist
          </span>
          <h2
            className="text-5xl md:text-6xl leading-tight mb-8"
            style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}
          >
            The Science of Understanding
          </h2>
          <p className="landing-body-text text-xl leading-relaxed font-bold" style={{ color: 'var(--text-muted)' }}>
            Humans retain information through{' '}
            <em style={{ color: 'var(--primary)', fontStyle: 'italic' }}>encoding richness</em>
            {' '}— the more pathways (visual, verbal, spatial, experiential) through which a
            concept is processed, the stronger and more retrievable the memory.
            Tasur&apos;s architecture is built around this principle.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '◈',
              title: 'Visual Learning',
              body: 'Mindmaps, flow diagrams, and concept sketches activate spatial memory — creating structures your brain naturally navigates rather than text it has to parse.',
            },
            {
              icon: '◉',
              title: 'Active Recall',
              body: 'Flashcards, teach-back exercises, and Socratic dialogue force your brain to retrieve — not just recognize — information. Retrieval is the act that builds the memory.',
              elevated: true,
            },
            {
              icon: '◎',
              title: 'Spaced Repetition',
              body: 'An AI orchestrator schedules reviews at the precise moment before you would forget, compounding retention without wasting time on concepts you already own.',
            },
          ].map(({ icon, title, body, elevated }, index) => (
            <div
              key={title}
              data-scroll-reveal
              className={`p-8 rounded-xl transition-all duration-200 ${
                index === 0
                  ? 'reveal-stagger-1'
                  : index === 1
                    ? 'reveal-stagger-2'
                    : 'reveal-stagger-3'
              }`}
              style={{
                background: elevated ? 'var(--bg)' : 'var(--surface)',
                marginTop: elevated ? '-2rem' : '0',
                boxShadow: elevated
                  ? '0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent)'
                  : 'none',
              }}
            >
              <div
                className="w-11 h-11 flex items-center justify-center rounded-sm mb-6 text-xl"
                style={{
                  background: elevated
                    ? 'var(--primary)'
                    : 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  color: elevated ? '#ffffff' : 'var(--primary)',
                }}
              >
                {icon}
              </div>
              <h3
                className="text-2xl mb-3"
                style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}
              >
                {title}
              </h3>
              <p className="landing-body-text text-base leading-relaxed font-bold" style={{ color: 'var(--text-muted)' }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Methodology — Five-Phase Learning Flow
// ------------------------------------------------------------------

function Methodology() {
  const phases = [
    {
      number: '01',
      title: 'Ingest & Orient',
      description:
        'Upload your notes, slides, or PDFs. In a single step, Tasur generates a comprehensive Freeplane mindmap — the single source of truth from which your entire learning experience flows. You see the full landscape before diving in.',
    },
    {
      number: '02',
      title: 'Concept Breakdown',
      description:
        'The AI study partner walks through concepts following the mindmap\'s natural structure — foundational ideas first, complex ones after prerequisites are solid. Analogies, real-world examples, and micro-assessments after each concept feed your understanding back to the orchestrator.',
    },
    {
      number: '03',
      title: 'Connect & Visualize',
      description:
        'Interactive visual artifacts — mindmaps, flow diagrams, concept sketches — that you manipulate. Fill in missing nodes. Drag concepts to where they connect. The act of constructing the visual is itself a learning event. This phase also includes teach-back: explain a concept, and the AI evaluates your understanding.',
    },
    {
      number: '04',
      title: 'Retrieval Practice',
      description:
        'Spaced repetition flashcards weighted by the orchestrator\'s model of your understanding. Multiple formats: pure recall, application scenarios, "explain this simply," compare-and-contrast. The system knows what you struggled with and weights accordingly.',
    },
    {
      number: '05',
      title: 'Exam Simulation',
      description:
        'Timed, exam-style questions with detailed feedback. For coding subjects, this includes "write code to solve this" challenges with automated evaluation. Builds confidence and surfaces last-minute gaps before it matters.',
    },
  ];

  return (
    <section
      id="methodology"
      data-scroll-reveal
      className="reveal-delay-2 py-28 max-w-screen-xl mx-auto px-8 md:px-12"
    >
      <div className="mb-16 manuscript-heading">
        <span
          className="text-xs font-bold tracking-[0.2em] uppercase block mb-4"
          style={{ fontFamily: 'var(--font-geist-mono)', color: 'var(--primary)' }}
        >
          How It Works
        </span>
        <h2
          className="text-5xl md:text-6xl"
          style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}
        >
          The Five-Phase Flow
        </h2>
        <div className="h-0.5 w-20 mt-4" style={{ background: 'var(--primary)' }} />
      </div>

      <div className="space-y-4">
        {phases.map((phase, index) => (
          <div
            key={phase.number}
            data-scroll-reveal
            className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-8 rounded-xl group transition-all duration-200 hover:shadow-lg ${
              index === 0
                ? 'reveal-stagger-1'
                : index === 1
                  ? 'reveal-stagger-2'
                  : index === 2
                    ? 'reveal-stagger-3'
                    : 'reveal-stagger-4'
            }`}
            style={{ background: 'var(--surface)' }}
          >
            <div className="lg:col-span-1">
              <span
                style={{
                  fontFamily: 'var(--font-geist-mono)',
                  color: 'var(--primary)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                {phase.number}
              </span>
            </div>
            <div className="lg:col-span-3">
              <h3
                className="text-2xl"
                style={{ fontFamily: 'var(--font-instrument-serif)', color: 'var(--text)' }}
              >
                {phase.title}
              </h3>
            </div>
            <div className="lg:col-span-8">
              <p
                className="landing-body-text text-base leading-relaxed font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                {phase.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// CTA
// ------------------------------------------------------------------

function Cta() {
  return (
    <section
      data-scroll-reveal
      className="reveal-delay-2 py-28 relative overflow-hidden"
      style={{ background: 'var(--primary)' }}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg,#ffffff 0,#ffffff 1px,transparent 0,transparent 50%)',
          backgroundSize: '8px 8px',
        }}
      />
      <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
        <h2
          className="text-6xl md:text-7xl leading-tight mb-12 text-white"
          style={{ fontFamily: 'var(--font-instrument-serif)' }}
        >
          Ready to cultivate
          <br />
            <em style={{ fontStyle: 'italic', textDecoration: 'underline', textDecorationColor: '#ffffff', textDecorationThickness: '3px', textUnderlineOffset: '8px' }}>
            deep understanding?
            </em>
        </h2>
        <Link
          href="/signup"
          className="inline-block px-12 py-5 text-lg font-bold transition-all duration-200 hover:scale-[1.03] hover:shadow-2xl"
          style={{ background: '#ffffff', color: 'var(--primary)', borderRadius: '3px' }}
        >
          Begin Your Study
        </Link>
        <p
          className="mt-8 text-sm tracking-[0.15em] uppercase opacity-75 text-white font-bold"
          style={{ fontFamily: 'var(--font-geist-mono)' }}
        >
          Start for free. No credit card required.
        </p>
        <p className="mt-4 text-sm text-white opacity-60 font-semibold">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-2 opacity-100">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Footer
// ------------------------------------------------------------------

function Footer() {
  return (
    <footer style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-screen-xl mx-auto px-8 md:px-12 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <TasurWordmark size={20} />
          <p className="text-xs tracking-wide uppercase mt-1" style={{ color: 'var(--text-muted)' }}>
            © 2025 Tasur. Cultivating the Scholarly Mind.
          </p>
        </div>
        <div className="flex gap-10">
          {['Privacy', 'Terms', 'Archive', 'Contact'].map((label) => (
            <a
              key={label}
              href="#"
              className="landing-nav-link text-xs tracking-wide uppercase underline underline-offset-4"
              style={{ textDecorationColor: 'color-mix(in srgb, var(--primary) 50%, transparent)' }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="landing-parchment">
        <ScrollRevealController />
        <div aria-hidden className="landing-parchment-backdrop" />
        <div aria-hidden className="landing-ink-ornaments" />
        <Hero />
        <Philosophy />
        <ScholarsInterface />
        <ConceptualMapping />
        <AiTutor />
        <AdaptiveFlashcards />
        <Methodology />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
