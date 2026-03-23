/**
 * WHY: Renders "Tas[logo]r" where the actual nib/shield logo SVG
 * replaces the 'u'. The logo visually reads as a 'U' letterform.
 * Uses the static /logo.svg asset from /public.
 */

export function TasurWordmark({
  size = 22,
  color = 'var(--logo)',
}: {
  size?: number;
  color?: string;
}) {
  // Logo SVG is roughly 1:1.4 aspect (taller than wide)
  const logoHeight = size * 1.05;
  const logoWidth  = logoHeight * 0.72;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontSize: size,
        color,
        fontWeight: 400,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        gap: 1,
      }}
    >
      Tas
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        width={logoWidth}
        height={logoHeight}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          // Use CSS variable so the filter switches with the theme
          filter: 'var(--logo-filter)',
          position: 'relative',
          top: '-1px',
        }}
      />
      r
    </span>
  );
}
