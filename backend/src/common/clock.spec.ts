import { systemClock } from './clock.js';

describe('systemClock', () => {
  it('reports the current time', () => {
    const before = Date.now();

    const now = systemClock.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
