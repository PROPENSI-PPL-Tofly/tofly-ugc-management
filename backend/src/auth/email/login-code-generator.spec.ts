import { decoyCodeHash, generateLoginCode } from './login-code-generator.js';
import { hashLoginCode } from './login-code-hash.js';

describe('generateLoginCode', () => {
  it('draws from the whole six-digit range, zero to 999999', () => {
    const randomInt = vi.fn(() => 123456);
    expect(generateLoginCode(randomInt)).toBe('123456');
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it('keeps leading zeros, so every code is exactly six digits', () => {
    expect(generateLoginCode(() => 42)).toBe('000042');
    expect(generateLoginCode(() => 0)).toBe('000000');
    expect(generateLoginCode(() => 999_999)).toBe('999999');
  });

  it('uses the cryptographic generator by default', () => {
    const codes = new Set(
      Array.from({ length: 200 }, () => generateLoginCode()),
    );
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    // Two hundred draws from a million values: a repeat-heavy set means a broken source.
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('decoyCodeHash', () => {
  it('looks exactly like a real code hash: 64 lower-case hex characters', () => {
    const real = hashLoginCode('a@example.com', '123456', 'x'.repeat(32));
    expect(real).toMatch(/^[0-9a-f]{64}$/);
    expect(decoyCodeHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is fresh randomness every time, derived from no code', () => {
    expect(decoyCodeHash()).not.toBe(decoyCodeHash());
  });
});
