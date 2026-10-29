import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/** 32 bytes in standard base64 is 43 characters and one `=` (`openssl rand -base64 32`). */
const KEY = /^[A-Za-z0-9+/]{43}=$/;

/** v1, then a 12-byte IV, a 16-byte tag and the ciphertext, each in unpadded base64url. */
const SEALED =
  /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]*)$/;

/** Any failure to open a stored token, without saying which part failed. */
export class TokenCipherError extends Error {
  override readonly name = 'TokenCipherError';

  constructor() {
    super('token cannot be decrypted');
  }
}

/**
 * Encrypts platform tokens at rest (PRD 3.6, OWASP A04:2025 Cryptographic Failures). AES-256-GCM
 * both hides the token and detects any change to what is stored. The context, the creator and
 * platform the token belongs to, is bound in as associated data, so a token copied into
 * another creator's row does not open there. The key lives only in server config.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    if (!KEY.test(keyBase64)) {
      throw new Error('SOCIAL_TOKEN_KEY must be 32 bytes in base64');
    }
    this.key = Buffer.from(keyBase64, 'base64');
  }

  encrypt(plain: string, context: string): string {
    // A fresh random IV per token: GCM is only safe when an IV never repeats under one key.
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(sealed: string, context: string): string {
    const parts = SEALED.exec(sealed);
    if (!parts) {
      throw new TokenCipherError();
    }
    const [, iv, tag, ciphertext] = parts;
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new TokenCipherError();
    }
  }
}
