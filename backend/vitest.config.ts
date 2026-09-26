import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        // Prisma connection wiring (extends PrismaClient, $connect on boot):
        // its correctness is proven by the live DB health check, not unit tests.
        'src/prisma/**',
        'test/**',
        '**/*.config.{ts,mts,js}',
      ],
      thresholds: {
        lines: 80,
        // The creator identity and Task Saya code is held to full coverage: a line or branch
        // no test runs there is an access rule nobody has checked.
        'src/auth/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'src/me/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
