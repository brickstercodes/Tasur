/**
 * WHY: Next.js instrumentation hook — runs once when the server starts,
 * before any route handler is invoked.
 *
 * pdfjs-dist (used internally by pdf-parse) references browser canvas APIs
 * (DOMMatrix, ImageData, Path2D) at module load time. Vercel's serverless
 * Node runtime has none of these. Without stubs, the module throws
 * "ReferenceError: DOMMatrix is not defined" and the entire upload route
 * crashes before it can run.
 *
 * We install minimal no-op stubs here. pdf-parse only uses pdfjs-dist for
 * text extraction — it never actually renders to a canvas — so stubs are
 * sufficient. @napi-rs/canvas (the native canvas binding) is intentionally
 * absent on Vercel; the warning it emits is harmless.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (typeof globalThis.DOMMatrix === 'undefined') {
      // @ts-expect-error — stub for pdfjs-dist canvas polyfill path
      globalThis.DOMMatrix = class DOMMatrix {
        constructor() {}
      };
    }

    if (typeof globalThis.ImageData === 'undefined') {
      // @ts-expect-error — stub for pdfjs-dist canvas polyfill path
      globalThis.ImageData = class ImageData {
        constructor() {}
      };
    }

    if (typeof globalThis.Path2D === 'undefined') {
      // @ts-expect-error — stub for pdfjs-dist canvas polyfill path
      globalThis.Path2D = class Path2D {
        constructor() {}
      };
    }
  }
}
