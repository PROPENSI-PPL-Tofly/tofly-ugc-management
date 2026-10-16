// Mutation testing: Stryker makes small changes to the source (flips a `<`, drops a branch,
// empties a string) and reruns the unit tests against each one. A change no test notices is
// a "surviving mutant": code that line coverage counts as tested but no assertion pins down.
// Run `npm run test:mutation`; the HTML report lands in reports/mutation/.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  // Same scope as unit-test coverage (vitest.config.ts coverage.exclude).
  mutate: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/prisma/**',
  ],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // break fails `npm run test:mutation` when the whole backend scores below it, so a change that
  // adds code no assertion pins down is caught before the PR, not noticed later in the report.
  // Staging scored 94.14% on 16 Oct 2026 (3649 killed, 13 timed out, 228 survived); 90 is the
  // "high" line, kept as the floor so ordinary drift passes and a real gap does not.
  thresholds: { high: 90, low: 80, break: 90 },
  // Reuses the last run's results for files and tests that did not change (reports/ is
  // git-ignored), so a rerun after a small fix takes seconds instead of the full 5 minutes.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
};
