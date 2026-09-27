// The values one Google sign-in attempt carries from GET /auth/google to its callback
// (OAuth 2.0 authorization code flow with PKCE, RFC 6749 + RFC 7636). Plain functions, so the
// controller only moves them between the cookie and Google.

import { createHash, randomBytes } from 'node:crypto';

export interface OAuthFlow {
  /** Ties the callback to the browser that started it (CSRF). */
  state: string;
  /** Ties the ID token to this attempt (replay); checked by the token verifier. */
  nonce: string;
  /** PKCE secret: only its hash goes to Google, so a stolen code alone is useless. */
  verifier: string;
}

/** 32 random bytes as unpadded base64url: 43 characters, 256 bits. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The S256 code challenge for a PKCE verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function newFlow(random: () => string = randomToken): OAuthFlow {
  return { state: random(), nonce: random(), verifier: random() };
}

const TOKEN = '[A-Za-z0-9_-]{43}';
const FLOW_COOKIE = new RegExp(`^(${TOKEN})\\.(${TOKEN})\\.(${TOKEN})$`);

/** base64url never contains a dot, so the three values join without escaping. */
export function serializeFlow(flow: OAuthFlow): string {
  return `${flow.state}.${flow.nonce}.${flow.verifier}`;
}

/** The flow stored in the cookie, or undefined for anything this app did not write. */
export function parseFlow(value: unknown): OAuthFlow | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = FLOW_COOKIE.exec(value);
  if (!match) {
    return undefined;
  }
  const [, state, nonce, verifier] = match;
  return { state, nonce, verifier };
}
