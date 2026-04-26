/**
 * WHY: Renders "Tas[logo]r" where the nib/shield logo SVG replaces the 'u'.
 * The logo visually reads as a 'U' letterform.
 *
 * standalone=true switches to absolute URLs + hardcoded colors so the
 * rendered HTML/CSS can be copy-pasted to external sites (e.g. notesportal).
 */

const PROD_BASE = 'https://tasur.app';

export function TasurWordmark({
  size = 22,
  color,
  standalone = false,
}: {
  size?: number;
  /** Text color. Defaults to var(--logo) in app context, #1a1c1b in standalone. */
  color?: string;
  /** When true: absolute logo URL, hardcoded color — safe to embed anywhere. */
  standalone?: boolean;
}) {
  const resolvedColor = color ?? (standalone ? '#1a1c1b' : 'var(--logo)');
  const logoSrc = standalone ? `${PROD_BASE}/logo.svg` : '/logo.svg';

  // Logo SVG is roughly 534×908 — about 0.59:1 aspect ratio (tall)
  const logoHeight = size * 1.1;
  const logoWidth = logoHeight * 0.59;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif",
        fontSize: size,
        color: resolvedColor,
        fontWeight: 400,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        gap: 1,
      }}
    >
      Tas
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        width={logoWidth}
        height={logoHeight}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          position: 'relative',
          top: '-1px',
          filter: standalone ? 'none' : 'var(--logo-filter)',
        }}
      />
      r
    </span>
  );
}

/**
 * Returns a self-contained HTML snippet of the wordmark — paste directly
 * into any page without Next.js or CSS variables.
 *
 * Usage: TasurWordmark.toHTML(28)
 */
TasurWordmark.toHTML = function toHTML(size = 22, color = '#1a1c1b'): string {
  const logoHeight = size * 1.1;
  const logoWidth = (logoHeight * 0.59).toFixed(1);

  return `<span style="display:inline-flex;align-items:center;font-family:'Instrument Serif',Georgia,serif;font-size:${size}px;color:${color};font-weight:400;letter-spacing:-0.01em;line-height:1;gap:1px;">Tas<img src="${PROD_BASE}/logo.svg" alt="" aria-hidden="true" width="${logoWidth}" height="${logoHeight}" style="display:inline-block;vertical-align:middle;position:relative;top:-1px;" />r</span>`;
};
