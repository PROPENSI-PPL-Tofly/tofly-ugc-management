import { PERFORMANCE_PAGE, performancePath } from './connect-outcome.js';

describe('performancePath', () => {
  it('lands on the creator Performa page (19.4)', () => {
    expect(PERFORMANCE_PAGE).toBe('/creator/performance');
  });

  it('says which platform connected, for the success toast', () => {
    expect(performancePath('tiktok', 'connected')).toBe(
      '/creator/performance?connected=tiktok',
    );
    expect(performancePath('instagram', 'connected')).toBe(
      '/creator/performance?connected=instagram',
    );
  });

  it.each([
    'cancelled',
    'not_tester',
    'account_taken',
    'platform_error',
    'connect_failed',
  ] as const)('names the platform and the %s error', (error) => {
    expect(performancePath('tiktok', error)).toBe(
      `/creator/performance?platform=tiktok&error=${error}`,
    );
  });

  // OWASP A01:2025: every answer is a fixed same-origin path built from closed sets, so
  // nothing in a request can turn the callback into an open redirect.
  it('always stays on this site', () => {
    expect(performancePath('tiktok', 'platform_error')).toMatch(
      /^\/creator\/performance\?/,
    );
  });
});
