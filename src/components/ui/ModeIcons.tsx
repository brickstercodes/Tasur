/**
 * WHY: Mode card icons for the upload flow.
 * Uses the actual SVG files provided by the designer — /public/steady.svg
 * (shoe silhouette) and /public/run.svg (running figure with speed lines).
 */

export function SteadyIcon({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/steady.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}

export function FastIcon({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/run.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}
