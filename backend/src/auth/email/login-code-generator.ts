import { randomBytes, randomInt } from 'node:crypto';

/** Draws an integer in [min, max); node:crypto's randomInt in production, a stub in tests. */
export type RandomInt = (min: number, max: number) => number;

/** A six-digit login code from a cryptographically secure source, leading zeros kept. */
export function generateLoginCode(random: RandomInt = randomInt): string {
  return random(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * What an unknown or revoked address stores instead of a code hash. It has the shape of an
 * HMAC-SHA256 hex digest, so the table does not show which addresses are registered, but it is
 * drawn from 256 random bits rather than computed from any code, so no code ever matches it.
 */
export function decoyCodeHash(): string {
  return randomBytes(32).toString('hex');
}
