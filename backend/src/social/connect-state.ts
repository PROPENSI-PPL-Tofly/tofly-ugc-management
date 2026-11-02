// The state a creator's connect flow carries to Instagram or TikTok and back (PBI-19, AC 14).
// Behind Firebase Hosting only the session cookie reaches the backend, and the creator is
// already signed in, so the state cannot sit in a cookie of its own as Google sign-in's does.
// It is signed instead: an HMAC over who started the flow, for which platform and until when,
// so a callback from another session, another platform or an old attempt is refused.

import { createHmac } from 'node:crypto';
import { sameToken } from '../auth/google/callback.js';
import { randomToken } from '../auth/google/oauth-flow.js';

export type SocialPlatform = 'instagram' | 'tiktok';

export interface StateClaims {
  creatorId: string;
  platform: SocialPlatform;
}

// Long enough to log in to the platform and consent, as Google sign-in's flow allows.
export const STATE_TTL_MS = 10 * 60 * 1000;

// A real state is about 200 characters; anything far longer is not one of ours.
export const MAX_STATE_LENGTH = 512;

interface Payload {
  c: string;
  p: string;
  // A random nonce, so two attempts by the same creator never share a state.
  n: string;
  e: number;
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signState(
  claims: StateClaims,
  secret: string,
  now: number = Date.now(),
): string {
  const payload: Payload = {
    c: claims.creatorId,
    p: claims.platform,
    n: randomToken(),
    e: now + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

function payloadOf(body: string): Partial<Payload> | null {
  try {
    return JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as Partial<Payload> | null;
  } catch {
    return null;
  }
}

// True only for a state this server signed, for this creator and platform, not yet expired.
export function verifyState(
  state: unknown,
  secret: string,
  expected: StateClaims,
  now: number = Date.now(),
): boolean {
  if (typeof state !== 'string' || state.length > MAX_STATE_LENGTH) {
    return false;
  }
  const parts = state.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const [body, signature] = parts;
  // The signature is checked first, so nothing in the payload is read before it is trusted.
  if (!sameToken(mac(body, secret), signature)) {
    return false;
  }
  const payload = payloadOf(body);
  return (
    payload?.c === expected.creatorId &&
    payload.p === expected.platform &&
    typeof payload.e === 'number' &&
    now < payload.e
  );
}
