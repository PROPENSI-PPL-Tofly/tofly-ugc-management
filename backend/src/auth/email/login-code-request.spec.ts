import {
  CODE_LIFETIME_MS,
  CODES_PER_HOUR,
  decoyCodeHash,
  minutesToWait,
  newLoginCode,
  RATE_WINDOW_MS,
} from './login-code-request.js';

const NOW = new Date('2026-11-04T08:00:00.000Z');

describe('the request rules', () => {
  it('keeps a code for 10 minutes and allows 5 codes an hour', () => {
    expect(CODE_LIFETIME_MS).toBe(10 * 60 * 1000);
    expect(RATE_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(CODES_PER_HOUR).toBe(5);
  });
});

describe('newLoginCode', () => {
  it('draws from the whole six-digit range with a CSPRNG', () => {
    const draw = vi.fn().mockReturnValue(123456);

    expect(newLoginCode(draw)).toBe('123456');
    expect(draw).toHaveBeenCalledWith(0, 1_000_000);
  });

  it.each([
    [0, '000000'],
    [42, '000042'],
    [999_999, '999999'],
  ])('pads %i to six digits', (value, code) => {
    expect(newLoginCode(() => value)).toBe(code);
  });

  it('uses node:crypto by default', () => {
    expect(newLoginCode()).toMatch(/^\d{6}$/);
  });
});

describe('decoyCodeHash', () => {
  it('is 64 hex characters, like a real HMAC-SHA256, from 32 random bytes', () => {
    const bytes = vi.fn().mockReturnValue(Buffer.alloc(32, 0xab));

    expect(decoyCodeHash(bytes)).toBe('ab'.repeat(32));
    expect(bytes).toHaveBeenCalledWith(32);
  });

  it('differs every time by default, so no code can be guessed to match it', () => {
    expect(decoyCodeHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(decoyCodeHash()).not.toBe(decoyCodeHash());
  });
});

describe('minutesToWait', () => {
  function oldest(minutesAgo: number): Date {
    return new Date(NOW.getTime() - minutesAgo * 60 * 1000);
  }

  it('counts the minutes until the oldest code in the hour leaves it', () => {
    expect(minutesToWait(oldest(15), NOW)).toBe(45);
  });

  it('rounds a part minute up, so the user never retries too early', () => {
    expect(minutesToWait(new Date(oldest(15).getTime() + 1), NOW)).toBe(46);
  });

  it('never says 0 minutes', () => {
    expect(minutesToWait(oldest(60), NOW)).toBe(1);
    expect(minutesToWait(oldest(59.99), NOW)).toBe(1);
  });
});
