import { createHmac } from 'node:crypto';
import { PortNotReady } from '../google/unready-ports.js';
import { hashLoginCode, loginCodeHasher } from './login-code-hash.js';

const SECRET = 'a-server-secret-of-at-least-32-characters';

describe('hashLoginCode', () => {
  it('is the hex HMAC-SHA256 of the lower-cased email and the code', () => {
    expect(hashLoginCode('Rangga@Example.com', '123456', SECRET)).toBe(
      createHmac('sha256', SECRET)
        .update('rangga@example.com:123456')
        .digest('hex'),
    );
  });

  it('gives the same code a different hash for another email', () => {
    expect(hashLoginCode('a@example.com', '123456', SECRET)).not.toBe(
      hashLoginCode('b@example.com', '123456', SECRET),
    );
  });

  it('cannot be reproduced from a database dump without the secret', () => {
    expect(hashLoginCode('a@example.com', '123456', SECRET)).not.toBe(
      hashLoginCode('a@example.com', '123456', 'another-secret'),
    );
  });
});

describe('loginCodeHasher', () => {
  it('hashes with the configured secret', () => {
    expect(loginCodeHasher(SECRET)('a@example.com', '123456')).toBe(
      hashLoginCode('a@example.com', '123456', SECRET),
    );
  });

  it('refuses to hash without a secret, rather than hash with an empty key', () => {
    expect(() => loginCodeHasher(undefined)('a@example.com', '123456')).toThrow(
      new PortNotReady('LOGIN_CODE_SECRET is not configured'),
    );
  });
});
