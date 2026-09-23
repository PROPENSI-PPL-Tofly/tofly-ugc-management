import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every e2e file writes to the same database, and GET /creators asserts exact totals, so
    // one file's rows must not be visible while another runs.
    fileParallelism: false,
  },
});
