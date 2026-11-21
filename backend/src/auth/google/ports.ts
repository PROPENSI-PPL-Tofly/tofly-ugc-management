// What the Google redirect flow needs from the rest of sign-in. Token verification and
// whitelist resolution remain separate work items; the session port is bound by SessionModule.

import type { Response } from 'express';

/** Who Google says signed in, after the ID token has been checked. */
export interface GoogleIdentity {
  /** Google's stable account id. */
  sub: string;
  /** Lower-cased; only ever from a token whose email Google has verified. */
  email: string;
}

/**
 * Checks the ID token from the code exchange (signature, issuer, audience = our client id,
 * expiry, email_verified) and that its nonce is the one this flow sent. Throws on any failure.
 */
export interface IdTokenVerifier {
  verify(idToken: string, nonce: string): Promise<GoogleIdentity>;
}

/** PBI-23: Super Admin can do everything Admin can, plus the Super Admin pages. */
export type AdminRole = 'admin' | 'super_admin';

/**
 * Who the whitelist says the person is. The role comes from the whitelist, never from Google.
 * `adminRole` is read from the whitelist on each request; a session record does not keep it, so a
 * role change applies on the next request.
 */
export type Principal =
  | { userId: string; role: 'admin'; adminRole?: AdminRole }
  | { userId: string; role: 'creator'; creatorId: string };

/** Looks the verified email up in Tofly's whitelist; null when it is absent or revoked. */
export interface WhitelistResolver {
  resolve(email: string): Promise<Principal | null>;
}

/** Starts the app session for a signed-in principal, e.g. by setting its httpOnly cookie. */
export interface SessionStarter {
  start(response: Response, principal: Principal): Promise<void>;
}

export const CODE_EXCHANGER = 'CODE_EXCHANGER';
export const ID_TOKEN_VERIFIER = 'ID_TOKEN_VERIFIER';
export const WHITELIST_RESOLVER = 'WHITELIST_RESOLVER';
export const SESSION_STARTER = 'SESSION_STARTER';
