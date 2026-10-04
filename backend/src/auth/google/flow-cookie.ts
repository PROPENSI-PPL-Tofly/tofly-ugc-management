import type { CookieOptions } from 'express';
import { SESSION_COOKIE_NAME } from '../session/session-cookie.js';

/** Long enough to pick an account and consent; a stale flow should not linger. */
const FLOW_TTL_MS = 10 * 60 * 1000;

export interface FlowCookie {
  name: string;
  options: CookieOptions & { maxAge: number };
}

/**
 * Where one sign-in attempt keeps its state, nonce and PKCE verifier between GET /auth/google
 * and the callback. httpOnly keeps scripts off it; SameSite=Lax because Google's redirect back
 * is a cross-site top-level GET, which Strict would strip. It shares the session cookie's name
 * because Firebase Hosting forwards no other: the callback clears the flow before the session
 * is set, and the two values never parse as each other.
 */
export function flowCookie(
  env: Record<string, string | undefined>,
): FlowCookie {
  const production = env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: FLOW_TTL_MS,
    },
  };
}
