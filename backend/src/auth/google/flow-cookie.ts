import type { CookieOptions } from 'express';

/** Long enough to pick an account and consent; a stale flow should not linger. */
const FLOW_TTL_MS = 10 * 60 * 1000;

export interface FlowCookie {
  name: string;
  options: CookieOptions & { maxAge: number };
}

/**
 * Where one sign-in attempt keeps its state, nonce and PKCE verifier between GET /auth/google
 * and the callback. httpOnly keeps scripts off it; SameSite=Lax because Google's redirect back
 * is a cross-site top-level GET, which Strict would strip. In production the __Host- prefix
 * makes the browser refuse it unless it is Secure, host-only and Path=/, so a sibling domain
 * cannot plant a flow of its own.
 */
export function flowCookie(
  env: Record<string, string | undefined>,
): FlowCookie {
  const production = env.NODE_ENV === 'production';
  return {
    name: production ? '__Host-tofly_oauth' : 'tofly_oauth',
    options: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: FLOW_TTL_MS,
    },
  };
}
