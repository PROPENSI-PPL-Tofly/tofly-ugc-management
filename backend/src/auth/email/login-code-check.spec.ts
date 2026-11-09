import { attemptsLeft, isLiveLoginCode } from './login-code-check.js';

const NOW = new Date('2026-11-04T08:00:00.000Z');
const LIVE = {
  id: 'code-1',
  codeHash: 'hash',
  expiresAt: new Date(NOW.getTime() + 1),
  attempts: 0,
  usedAt: null,
};

describe('isLiveLoginCode', () => {
  it('accepts an unused code before it expires, with attempts left', () => {
    expect(isLiveLoginCode({ ...LIVE, attempts: 4 }, NOW)).toBe(true);
  });

  it('refuses a code at the moment it expires', () => {
    expect(isLiveLoginCode({ ...LIVE, expiresAt: NOW }, NOW)).toBe(false);
  });

  it('refuses a code that has been used', () => {
    expect(isLiveLoginCode({ ...LIVE, usedAt: NOW }, NOW)).toBe(false);
  });

  it('refuses a code with five wrong attempts', () => {
    expect(isLiveLoginCode({ ...LIVE, attempts: 5 }, NOW)).toBe(false);
  });
});

describe('attemptsLeft', () => {
  it('counts down from five', () => {
    expect(attemptsLeft(1)).toBe(4);
    expect(attemptsLeft(4)).toBe(1);
    expect(attemptsLeft(5)).toBe(0);
  });
});
