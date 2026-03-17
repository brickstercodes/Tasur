/**
 * WHY: ESLint flat config for Tasur.
 *
 * Extends Next.js recommended rules and adds project-specific guardrails:
 * - max-lines-per-function (warn at 100): enforces the "functions do one thing" principle
 * - max-params (warn at 6): flags functions that may need a params object
 * - import/order: keeps imports grouped (external → internal → relative) for readability
 */

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importPlugin from 'eslint-plugin-import';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Default ignores from eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),

  // Project-specific rules layered on top of Next.js defaults.
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Warn when a function exceeds 100 lines (blank lines and comments excluded).
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],

      // Warn when a function has more than 6 parameters — use a params object instead.
      'max-params': ['warn', 6],

      // Keep imports grouped: external deps first, then internal (@/), then relative.
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
            },
          ],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'ignore',
        },
      ],
    },
  },
]);

export default eslintConfig;
