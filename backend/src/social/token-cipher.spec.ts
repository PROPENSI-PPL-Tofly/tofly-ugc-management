import { randomBytes } from 'node:crypto';
import { TokenCipher, TokenCipherError } from './token-cipher.js';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');
const CONTEXT = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b:tiktok';
const TOKEN = 'act.example12345Example12345Example';

describe('TokenCipher', () => {
  const cipher = new TokenCipher(KEY);

  it('gives back the token it sealed', () => {
    expect(cipher.decrypt(cipher.encrypt(TOKEN, CONTEXT), CONTEXT)).toBe(TOKEN);
  });

  it('keeps unicode and an empty token intact', () => {
    for (const plain of ['', 'tökén-✓']) {
      expect(cipher.decrypt(cipher.encrypt(plain, CONTEXT), CONTEXT)).toBe(
        plain,
      );
    }
  });

  // OWASP A04:2025 (Cryptographic Failures): what reaches the database reveals nothing of the
  // token, and the same token never seals the same way twice.
  describe('what it stores', () => {
    it('never contains the token', () => {
      expect(cipher.encrypt(TOKEN, CONTEXT)).not.toContain(TOKEN);
    });

    it('is versioned text: v1, then the IV, tag and ciphertext in base64url', () => {
      expect(cipher.encrypt(TOKEN, CONTEXT)).toMatch(
        /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/,
      );
    });

    it('differs every time, so equal tokens cannot be spotted', () => {
      const sealed = new Set(
        Array.from({ length: 20 }, () => cipher.encrypt(TOKEN, CONTEXT)),
      );

      expect(sealed.size).toBe(20);
    });
  });

  describe('opening', () => {
    function refused(open: () => string): void {
      expect(open).toThrow(TokenCipherError);
      expect(open).toThrow('token cannot be decrypted');
    }

    it('refuses another key', () => {
      const sealed = cipher.encrypt(TOKEN, CONTEXT);

      refused(() => new TokenCipher(OTHER_KEY).decrypt(sealed, CONTEXT));
    });

    // A token copied into another creator's or platform's row does not open there.
    it('refuses another context', () => {
      const sealed = cipher.encrypt(TOKEN, CONTEXT);

      refused(() =>
        cipher.decrypt(sealed, '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d:tiktok'),
      );
      refused(() =>
        cipher.decrypt(sealed, CONTEXT.replace('tiktok', 'instagram')),
      );
    });

    it.each([
      ['the ciphertext', 3],
      ['the tag', 2],
      ['the IV', 1],
    ])('refuses a value whose %s was changed', (_label, part) => {
      const parts = cipher.encrypt(TOKEN, CONTEXT).split('.');
      parts[part] =
        `${parts[part].startsWith('A') ? 'B' : 'A'}${parts[part].slice(1)}`;

      refused(() => cipher.decrypt(parts.join('.'), CONTEXT));
    });

    it.each([
      ['empty', ''],
      ['plain text, as a token stored before encryption', TOKEN],
      ['an unknown version', 'v2.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaa.aaaa'],
      ['missing a part', 'v1.aaaaaaaaaaaaaaaa.aaaa'],
      ['a short IV', 'v1.aaaa.aaaaaaaaaaaaaaaaaaaaaa.aaaa'],
      ['a short tag', 'v1.aaaaaaaaaaaaaaaa.aaaa.aaaa'],
      ['not base64url', 'v1.aaaaaaaaaaaaaaa!.aaaaaaaaaaaaaaaaaaaaaa.aaaa'],
    ])('refuses a value that is %s', (_label, sealed) => {
      refused(() => cipher.decrypt(sealed, CONTEXT));
    });
  });

  // Boundary values of the key: AES-256 takes exactly 32 bytes.
  describe('its key', () => {
    const message = 'SOCIAL_TOKEN_KEY must be 32 bytes in base64';

    it('is accepted as 32 random bytes in base64 (openssl rand -base64 32)', () => {
      expect(() => new TokenCipher(KEY)).not.toThrow();
    });

    it.each([
      ['31 bytes', randomBytes(31).toString('base64')],
      ['33 bytes', randomBytes(33).toString('base64')],
      ['not base64', `${'*'.repeat(43)}=`],
      ['a passphrase', 'correct horse battery staple'],
      ['empty', ''],
    ])('is refused when it is %s', (_label, key) => {
      expect(() => new TokenCipher(key)).toThrow(message);
    });
  });
});
