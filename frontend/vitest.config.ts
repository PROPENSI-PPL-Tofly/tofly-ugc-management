import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Mirrors the "@/*" path alias in tsconfig.json, which Next resolves for the app but
  // Vitest does not know about on its own.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      // Sentry's runtime configs live in src/ and are measured like any other module;
      // only build config files (root/*.config.*) stay out, and they are outside include anyway.
      exclude: ['src/**/*.d.ts', 'src/**/layout.tsx'],
      thresholds: {
        lines: 80,
        // 31.5: an export that ticks the wrong rows or hides a skip is a finance bug, so every
        // line, branch, function and statement of the new selection/download code is covered.
        'src/components/invoicing/{bulk-selection*,bulk-export-button*,invoice-board*}.{ts,tsx}': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
