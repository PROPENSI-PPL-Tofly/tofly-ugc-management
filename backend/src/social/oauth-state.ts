import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

/** The platforms a creator connects (PBI-19); the same names as the `social_platform` enum. */
export type SocialPlatform = 'instagram' | 'tiktok';

/** Long enough to log in to the platform and consent; a stale attempt should not linger. */
export const STATE_TTL_MS = 10 * 60 * 1000;

/** HS256 needs a key at least as long as its 256-bit output to keep its strength. */
export const MIN_SECRET_BYTES = 32;

/** An issued state is about 300 characters; anything far longer is not one of ours. */
export const MAX_STATE_LENGTH = 1024;

/** Keeps a social-connect state from being accepted as any other token this app signs. */
const AUDIENCE = 'tofly:social-connect';

export type StateCheck = { ok: true } | { ok: false; reason: string };

function refuse(reason: string): StateCheck {
  return { ok: false, reason };
}

/**
 * The OAuth `state` of a social connect (PBI-19, 19.1 and 19.2), signed instead of stored.
 *
 * Google sign-in keeps its state in a cookie named like the session cookie, because Firebase
 * Hosting forwards no other. A creator connecting an account is already signed in, so that
 * cookie would overwrite their session. The state therefore carries what it vouches for, the
 * creator and the platform, under an HMAC only this server can make, and the callback checks
 * it against the session it arrives in (RFC 6749 §10.12). A state started in one creator's
 * session cannot finish in another's, which stops a forged link from attaching an attacker's
 * account to a victim (OWASP A01:2025).
 */
export class OAuthStateSigner {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    const key = new TextEncoder().encode(secret);
    if (key.byteLength < MIN_SECRET_BYTES) {
      throw new Error(
        `SOCIAL_STATE_SECRET must be at least ${MIN_SECRET_BYTES} bytes`,
      );
    }
    this.key = key;
  }

  /** A fresh state for one connect attempt; the random `jti` makes each one unique. */
  issue(creatorId: string, platform: SocialPlatform): Promise<string> {
    const issuedAt = this.now();
    return new SignJWT({ plt: platform })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(creatorId)
      .setAudience(AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(new Date(issuedAt.getTime() + STATE_TTL_MS))
      .sign(this.key);
  }

  /**
   * Whether `state`, straight from the callback query, is one this server issued for this
   * creator and platform and has not expired. The reason is for the server log only.
   */
  async verify(
    state: unknown,
    creatorId: string,
    platform: SocialPlatform,
  ): Promise<StateCheck> {
    if (
      typeof state !== 'string' ||
      state === '' ||
      state.length > MAX_STATE_LENGTH
    ) {
      return refuse('state missing or malformed');
    }

    let claims: { sub?: string; plt?: unknown };
    try {
      // Pinning the algorithm refuses unsigned (`none`) and public-key tokens outright.
      ({ payload: claims } = await jwtVerify(state, this.key, {
        algorithms: ['HS256'],
        audience: AUDIENCE,
        currentDate: this.now(),
        requiredClaims: ['sub', 'exp', 'jti'],
      }));
    } catch {
      return refuse('state signature or claims invalid');
    }

    if (claims.plt !== platform) {
      return refuse('state is for another platform');
    }
    if (claims.sub !== creatorId) {
      return refuse('state belongs to another session');
    }
    return { ok: true };
  }
}
