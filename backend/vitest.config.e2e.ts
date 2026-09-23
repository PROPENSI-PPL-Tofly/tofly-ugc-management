import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every e2e file talks to the same database, and some assert on roster-wide numbers
    // (totals, ordering); running files in parallel lets one file's inserts land inside
    // another's assertions.
    fileParallelism: false,
  },
});
