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
  thresholds: { high: 90, low: 80, break: null },
};
