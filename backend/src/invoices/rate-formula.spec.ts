import {
  PLACEHOLDER_RATE_FORMULA,
  PlaceholderRateFormulaSource,
} from './rate-formula.js';

describe('PlaceholderRateFormulaSource', () => {
  it('serves the placeholder formula until the stored one from 8.1 exists', async () => {
    await expect(new PlaceholderRateFormulaSource().current()).resolves.toBe(
      PLACEHOLDER_RATE_FORMULA,
    );
  });

  it('caps the penalty at 3 days by default (decided 12 Oct 2026)', () => {
    expect(PLACEHOLDER_RATE_FORMULA.maxPenaltyDays).toBe(3);
  });
});
