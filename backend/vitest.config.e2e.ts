import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // A developer's backend/.env turns the dev sign-in on (ConfigModule loads it when a test boots
    // AppModule), which answers 200 where a test expects 401. Pinned off, as in CI.
    env: { DEV_AUTH_ENABLED: 'false', DEV_CREATOR_ID: '' },
    // Every e2e file talks to the same database, and some assert on roster-wide numbers
    // (totals, ordering); running files in parallel lets one file's inserts land inside
    // another's assertions.
    fileParallelism: false,
  },
});
