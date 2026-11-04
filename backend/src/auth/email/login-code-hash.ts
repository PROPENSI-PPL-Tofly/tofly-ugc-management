import { createHmac } from 'node:crypto';
import { PortNotReady } from '../google/unready-ports.js';

export type LoginCodeHasher = (email: string, code: string) => string;

/**
 * A six-digit code has only a million values, so a plain digest falls to a lookup from a database
 * dump. The HMAC key lives outside the database, which keeps the stored hash useless on its own.
 */
export function hashLoginCode(
  email: string,
  code: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}

/** Hashes under the configured secret; without one it refuses rather than use an empty key. */
export function loginCodeHasher(secret: string | undefined): LoginCodeHasher {
  return (email, code) => {
    if (secret === undefined) {
      throw new PortNotReady('LOGIN_CODE_SECRET is not configured');
    }
    return hashLoginCode(email, code, secret);
  };
}
