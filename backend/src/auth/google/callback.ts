import { timingSafeEqual } from 'node:crypto';
import type { OAuthFlow } from './oauth-flow.js';

/** Google's codes are a few hundred characters; anything far longer is not one. */
export const MAX_CODE_LENGTH = 512;

/** The query Google redirects back with, straight from the request. */
export interface CallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
}

export type CallbackResult =
  | { ok: true; code: string; flow: OAuthFlow }
  | {
      ok: false;
      error: 'sign_in_failed' | 'cancelled';
      /** For the server log only; never shown to the user. */
      reason: string;
    };

/** Compares a secret without leaking through timing how much of it matched. */
export function sameToken(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fail(reason: string): CallbackResult {
  return { ok: false, error: 'sign_in_failed', reason };
}

/**
 * Accepts the callback only for the flow this browser started: the state in the query must
 * equal the one in the flow cookie (RFC 6749 §10.12), which a forged link cannot know. The
 * state is checked first, so nothing else in the query is trusted before it matches.
 */
export function checkCallback(
  query: CallbackQuery,
  flow: OAuthFlow | undefined,
): CallbackResult {
  if (!flow) {
    return fail('missing or malformed flow cookie');
  }
  if (typeof query.state !== 'string' || !sameToken(flow.state, query.state)) {
    return fail('state mismatch');
  }
  if (query.error !== undefined) {
    return query.error === 'access_denied'
      ? {
          ok: false,
          error: 'cancelled',
          reason: 'refused on the consent screen',
        }
      : fail('Google returned an error');
  }
  const { code } = query;
  if (
    typeof code !== 'string' ||
    code === '' ||
    code.length > MAX_CODE_LENGTH
  ) {
    return fail('missing or malformed code');
  }
  return { ok: true, code, flow };
}
