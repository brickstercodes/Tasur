/**
 * WHY: Vitest config for the Tasur parsing pipeline tests.
 *
 * The parsing layer (src/lib/parsing/) is pure Node.js — no Next.js routing,
 * no React, no browser APIs. Using the 'node' environment avoids the overhead
 * of jsdom and makes Buffer / fs available without polyfills. Timeout is raised
 * to 15 s to accommodate Tesseract.js worker initialisation in OCR tests, which
 * downloads language data on first run.
 *
 * loadEnv() from vite picks up .env.local (and .env) so GOOGLE_APPLICATION_CREDENTIALS
 * is available in integration tests without manually exporting env vars.
 */

import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? 'test', process.cwd(), '');
  return {
    test: {
      environment: 'node',
      testTimeout: 15_000,
      include: ['test/**/*.test.ts'],
      env,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
