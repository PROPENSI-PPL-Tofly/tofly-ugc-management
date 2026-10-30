import { connectedPath, connectErrorPath } from './connect-redirects.js';

describe('connect redirects', () => {
  it('lands a connected creator back on Performa, naming the platform', () => {
    expect(connectedPath('instagram')).toBe(
      '/creator/performance?platform=instagram&connected=1',
    );
  });

  it.each([
    'cancelled',
    'not_professional',
    'not_tester',
    'platform_error',
  ] as const)(
    'lands a failed attempt on Performa with the code %s',
    (error) => {
      expect(connectErrorPath('instagram', error)).toBe(
        `/creator/performance?platform=instagram&error=${error}`,
      );
    },
  );

  it('always lands on the same page of this app, never an address from outside', () => {
    for (const path of [
      connectedPath('instagram'),
      connectErrorPath('instagram', 'platform_error'),
    ]) {
      expect(path.startsWith('/creator/performance?')).toBe(true);
      expect(path).not.toContain('//');
    }
  });
});
