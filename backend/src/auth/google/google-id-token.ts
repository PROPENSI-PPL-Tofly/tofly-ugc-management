import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { GoogleIdentity, IdTokenVerifier } from './ports.js';

/** Where Google publishes the keys it signs ID tokens with (its discovery document's jwks_uri). */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Google documents both spellings of its issuer. */
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];

/** A sign-in waits on the key fetch; a stalled Google should fail it, not hold it open. */
export const JWKS_TIMEOUT_MS = 5000;

/**
 * Why a token was refused, in words safe for the server log: never the token, its claims'
 * values, or the email.
 */
export class IdTokenError extends Error {
  override readonly name = 'IdTokenError';
}

/** Google's signing keys, fetched on first use, cached, and refetched when Google rotates them. */
export function googleKeys(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
    timeoutDuration: JWKS_TIMEOUT_MS,
  });
}

/** The jose error code, plus the claim that failed when there is one: names, never values. */
function reasonOf(error: unknown): string {
  if (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTExpired
  ) {
    return `${error.code} (${error.claim})`;
  }
  return error instanceof errors.JOSEError ? error.code : 'unknown error';
}

/**
 * Checks an ID token from the code exchange as OpenID Connect Core §3.1.3.7 asks: Google's
 * signature (RS256 only, so neither `none` nor a shared-secret algorithm gets through), issuer,
 * audience = our client id, expiry, then the nonce this flow sent and a verified email.
 */
export class GoogleIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly clientId: string,
    private readonly keys: JWTVerifyGetKey = googleKeys(),
  ) {}

  async verify(idToken: string, nonce: string): Promise<GoogleIdentity> {
    let claims: JWTPayload;
    try {
      ({ payload: claims } = await jwtVerify(idToken, this.keys, {
        algorithms: ['RS256'],
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
        requiredClaims: ['sub', 'exp'],
      }));
    } catch (error) {
      throw new IdTokenError(`ID token rejected: ${reasonOf(error)}`);
    }

    // Binds the token to the browser that started this sign-in, so a token lifted from
    // another flow cannot be replayed here.
    if (claims.nonce !== nonce) {
      throw new IdTokenError('ID token nonce does not match this sign-in');
    }
    // The whitelist trusts the email, so it must be one Google has confirmed belongs to the
    // account; Google sends a boolean.
    if (claims.email_verified !== true) {
      throw new IdTokenError('ID token email is not verified');
    }
    if (typeof claims.email !== 'string' || claims.email === '') {
      throw new IdTokenError('ID token has no email');
    }
    return { sub: claims.sub!, email: claims.email.toLowerCase() };
  }
}
