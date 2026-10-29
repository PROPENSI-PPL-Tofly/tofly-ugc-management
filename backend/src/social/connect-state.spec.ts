import { createHmac } from 'node:crypto';
import {
  MAX_STATE_LENGTH,
  signState,
  STATE_TTL_MS,
  verifyState,
  type StateClaims,
} from './connect-state.js';

const SECRET = 'state-secret-for-tests-only';
const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER_CREATOR = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const NOW = Date.UTC(2026, 9, 29, 10, 0, 0);
const CLAIMS: StateClaims = { creatorId: CREATOR, platform: 'instagram' };

// Signs any payload the way the module does, so a test can forge a state that passes the
// signature check and reaches the checks behind it.
function signed(payload: string): string {
  const body = Buffer.from(payload).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

describe('signState and verifyState', () => {
  it('accepts a state signed for the same creator and platform', () => {
    const state = signState(CLAIMS, SECRET, NOW);

    expect(verifyState(state, SECRET, CLAIMS, NOW)).toBe(true);
  });

  it('accepts a state 1 ms before it expires', () => {
    const state = signState(CLAIMS, SECRET, NOW);

    expect(verifyState(state, SECRET, CLAIMS, NOW + STATE_TTL_MS - 1)).toBe(
      true,
    );
  });

  it('refuses a state once it has expired', () => {
    const state = signState(CLAIMS, SECRET, NOW);

    expect(verifyState(state, SECRET, CLAIMS, NOW + STATE_TTL_MS)).toBe(false);
  });

  it('refuses a state started by another creator', () => {
    const state = signState(
      { creatorId: OTHER_CREATOR, platform: 'instagram' },
      SECRET,
      NOW,
    );

    expect(verifyState(state, SECRET, CLAIMS, NOW)).toBe(false);
  });

  it('refuses a state started for another platform', () => {
    const state = signState(
      { creatorId: CREATOR, platform: 'tiktok' },
      SECRET,
      NOW,
    );

    expect(verifyState(state, SECRET, CLAIMS, NOW)).toBe(false);
  });

  it('refuses a state signed with another secret', () => {
    const state = signState(CLAIMS, 'another-secret', NOW);

    expect(verifyState(state, SECRET, CLAIMS, NOW)).toBe(false);
  });

  it('refuses a payload swapped for another creator under the old signature', () => {
    const other: StateClaims = {
      creatorId: OTHER_CREATOR,
      platform: 'instagram',
    };
    const [body] = signState(other, SECRET, NOW).split('.');
    const [, mac] = signState(CLAIMS, SECRET, NOW).split('.');

    expect(verifyState(`${body}.${mac}`, SECRET, other, NOW)).toBe(false);
  });

  it('refuses a state whose signature was changed', () => {
    const state = signState(CLAIMS, SECRET, NOW);
    const last = state.at(-1) === 'A' ? 'B' : 'A';

    expect(
      verifyState(`${state.slice(0, -1)}${last}`, SECRET, CLAIMS, NOW),
    ).toBe(false);
  });

  it.each([
    ['nothing', undefined],
    ['a number', 42],
    ['an empty value', ''],
    ['a value without a dot', 'abc'],
    ['three parts', 'a.b.c'],
    ['a value over the length limit', 'a'.repeat(MAX_STATE_LENGTH + 1)],
  ])('refuses %s', (_label, state) => {
    expect(verifyState(state, SECRET, CLAIMS, NOW)).toBe(false);
  });

  it.each([
    ['a payload that is not JSON', 'not json'],
    ['a payload that is JSON null', 'null'],
    [
      'a payload without an expiry',
      JSON.stringify({ c: CREATOR, p: 'instagram', n: 'x' }),
    ],
    [
      'a payload whose expiry is not a number',
      JSON.stringify({ c: CREATOR, p: 'instagram', n: 'x', e: 'later' }),
    ],
  ])('refuses a correctly signed state with %s', (_label, payload) => {
    expect(verifyState(signed(payload), SECRET, CLAIMS, NOW)).toBe(false);
  });

  it('gives two attempts by the same creator different states', () => {
    expect(signState(CLAIMS, SECRET, NOW)).not.toBe(
      signState(CLAIMS, SECRET, NOW),
    );
  });

  it('only uses characters that need no escaping in a URL', () => {
    expect(signState(CLAIMS, SECRET, NOW)).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });
});
