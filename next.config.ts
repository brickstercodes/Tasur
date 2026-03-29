import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // WHY: Required for the Railway Docker deployment — generates a minimal
  // standalone server bundle that doesn't need node_modules at runtime.
  output: 'standalone',

  // WHY: pdf-parse (via pdfjs-dist), tesseract.js, and mammoth all dynamically
  // load worker files or native bindings at runtime. Turbopack/webpack bundling
  // them into the server chunk breaks those relative-path resolutions. Marking
  // them external lets Node.js require() them directly from node_modules,
  // which is how they're designed to be used in a server context.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'tesseract.js', 'mammoth'],

  turbopack: {
    // WHY: Tailwind v4's `@import 'tailwindcss'` in globals.css causes Turbopack
    // to resolve the package from an incorrect ancestor directory. Aliasing it to
    // the explicit path in this project's node_modules fixes the resolution.
    resolveAlias: {
      tailwindcss: path.resolve('./node_modules/tailwindcss'),
    },
  },
};

export default nextConfig;
