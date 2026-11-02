import { SignJWT } from 'jose';
import {
  MAX_STATE_LENGTH,
  MIN_SECRET_BYTES,
  OAuthStateSigner,
  STATE_TTL_MS,
} from './oauth-state.js';

const SECRET = 'a'.repeat(MIN_SECRET_BYTES);
const OTHER_SECRET = 'b'.repeat(MIN_SECRET_BYTES);
const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER_CREATOR = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const T0 = new Date('2026-10-29T03:00:00.000Z');

/** A signer whose clock reads `now`, so expiry is tested at exact instants. */
function signerAt(now: Date, secret = SECRET): OAuthStateSigner {
  return new OAuthStateSigner(secret, () => now);
}

function later(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

describe('OAuthStateSigner', () => {
  describe('a state it issued', () => {
    it('is accepted back for the same creator and platform', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');

      await expect(
        signerAt(T0).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({ ok: true });
    });

    it('is URL-safe text, so it travels in the query string untouched', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');

      expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(state.length).toBeLessThanOrEqual(MAX_STATE_LENGTH);
    });

    it('differs on every issue, even for the same creator at the same instant', async () => {
      const signer = signerAt(T0);

      const states = await Promise.all(
        Array.from({ length: 20 }, () => signer.issue(CREATOR, 'tiktok')),
      );

      expect(new Set(states).size).toBe(20);
    });
  });

  // OWASP A01: a callback finished in another creator's session must not connect the account
  // to that creator (the account-linking CSRF the state exists to stop).
  describe('a state from somewhere else', () => {
    it('is refused when the callback arrives in another creator session', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');

      await expect(
        signerAt(T0).verify(state, OTHER_CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state belongs to another session',
      });
    });

    it('is refused on the other platform callback', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'instagram');

      await expect(
        signerAt(T0).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state is for another platform',
      });
    });

    it('is refused when signed with another secret', async () => {
      const state = await signerAt(T0, OTHER_SECRET).issue(CREATOR, 'tiktok');

      await expect(
        signerAt(T0).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });

    it('is refused when one character of its signature is changed', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');
      // The first signature character, not the last: base64url's last character carries
      // padding bits a decoder ignores, so changing it can leave the signature intact.
      const [header, payload, signature] = state.split('.');
      const first = signature.startsWith('A') ? 'B' : 'A';
      const tampered = `${header}.${payload}.${first}${signature.slice(1)}`;

      await expect(
        signerAt(T0).verify(tampered, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });

    it('is refused when its claims are edited and the old signature kept', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');
      const [header, payload, signature] = state.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = Buffer.from(
        JSON.stringify({ ...claims, sub: OTHER_CREATOR }),
      ).toString('base64url');

      await expect(
        signerAt(T0).verify(
          `${header}.${forged}.${signature}`,
          OTHER_CREATOR,
          'tiktok',
        ),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });

    it('is refused when it is an unsigned token (alg none)', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: CREATOR, plt: 'tiktok', exp: 4_102_444_800 }),
      ).toString('base64url');

      await expect(
        signerAt(T0).verify(`${header}.${payload}.`, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });

    it('is refused when it is a token this app signs for a different purpose', async () => {
      // Same secret and claims, but not issued as a social-connect state.
      const foreign = await new SignJWT({ plt: 'tiktok' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(CREATOR)
        .setExpirationTime(later(STATE_TTL_MS))
        .sign(new TextEncoder().encode(SECRET));

      await expect(
        signerAt(T0).verify(foreign, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });
  });

  // Boundary value analysis on the 10-minute lifetime.
  describe('expiry', () => {
    it('still accepts a state one second before it expires', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');

      await expect(
        signerAt(later(STATE_TTL_MS - 1000)).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({ ok: true });
    });

    it('refuses a state at the very second it expires', async () => {
      const state = await signerAt(T0).issue(CREATOR, 'tiktok');

      await expect(
        signerAt(later(STATE_TTL_MS)).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({
        ok: false,
        reason: 'state signature or claims invalid',
      });
    });

    it('lasts ten minutes, long enough to log in to TikTok and consent', () => {
      expect(STATE_TTL_MS).toBe(10 * 60 * 1000);
    });
  });

  // Equivalence classes of what the query can carry before any verification runs.
  describe('a state that is not a token at all', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['a number', 42],
      ['repeated in the query', ['x.y.z', 'x.y.z']],
    ])('is refused when %s', async (_label, state) => {
      await expect(
        signerAt(T0).verify(state, CREATOR, 'tiktok'),
      ).resolves.toEqual({ ok: false, reason: 'state missing or malformed' });
    });

    it('is refused when longer than any state this app issues', async () => {
      const oversized = `${'a'.repeat(MAX_STATE_LENGTH)}.b.c`;

      await expect(
        signerAt(T0).verify(oversized, CREATOR, 'tiktok'),
      ).resolves.toEqual({ ok: false, reason: 'state missing or malformed' });
    });
  });

  // OWASP A04:2025 Cryptographic Failures: a short HMAC key can be brute-forced, so the signer
  // refuses to exist with one rather than signing weakly.
  describe('its secret', () => {
    it(`must be at least ${MIN_SECRET_BYTES} bytes`, () => {
      expect(
        () => new OAuthStateSigner('x'.repeat(MIN_SECRET_BYTES - 1)),
      ).toThrow(
        `SOCIAL_STATE_SECRET must be at least ${MIN_SECRET_BYTES} bytes`,
      );
    });

    it(`is accepted at exactly ${MIN_SECRET_BYTES} bytes`, () => {
      expect(() => new OAuthStateSigner(SECRET)).not.toThrow();
    });

    it('counts bytes, not characters', () => {
      // 16 two-byte characters are 32 bytes.
      expect(() => new OAuthStateSigner('é'.repeat(16))).not.toThrow();
    });
  });

  it('reads the real clock when none is given', async () => {
    const signer = new OAuthStateSigner(SECRET);
    const state = await signer.issue(CREATOR, 'tiktok');

    await expect(signer.verify(state, CREATOR, 'tiktok')).resolves.toEqual({
      ok: true,
    });
  });
});
