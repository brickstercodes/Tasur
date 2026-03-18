/**
 * WHY: Vitest config for the Tasur parsing pipeline tests.
 *
 * The parsing layer (src/lib/parsing/) is pure Node.js — no Next.js routing,
 * no React, no browser APIs. Using the 'node' environment avoids the overhead
 * of jsdom and makes Buffer / fs available without polyfills. Timeout is raised
 * to 15 s to accommodate Tesseract.js worker initialisation in OCR tests, which
 * downloads language data on first run.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15_000,
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
