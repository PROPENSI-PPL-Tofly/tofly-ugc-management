import { randomBytes, randomInt } from 'node:crypto';

/** AC 3: a code is valid for 10 minutes. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000;

/** AC 5: at most this many codes per email in any rolling hour, decoys included. */
export const CODES_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

const CODE_RANGE = 1_000_000;
const DECOY_BYTES = 32;

export type DrawInt = (min: number, max: number) => number;
export type DrawBytes = (size: number) => Buffer;

/**
 * Six digits from the CSPRNG. randomInt rejects samples instead of taking a modulo, so every
 * code from 000000 to 999999 is equally likely and none is easier to guess.
 */
export function newLoginCode(
  draw: DrawInt = (min, max) => randomInt(min, max),
): string {
  return draw(0, CODE_RANGE).toString().padStart(6, '0');
}

/**
 * Stored for an email that gets no code: as long as a real HMAC-SHA256, and random, so no code
 * matches it and the row cannot be told from a real one.
 */
export function decoyCodeHash(
  draw: DrawBytes = (size) => randomBytes(size),
): string {
  return draw(DECOY_BYTES).toString('hex');
}

/** Whole minutes until the oldest code in the window leaves it; at least 1, never "0 menit". */
export function minutesToWait(oldestInWindow: Date, now: Date): number {
  const waitMs = oldestInWindow.getTime() + RATE_WINDOW_MS - now.getTime();
  return Math.max(1, Math.ceil(waitMs / 60_000));
}
