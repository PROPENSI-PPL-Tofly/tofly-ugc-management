import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'SESSION_COOKIE';
/**
 * The only cookie Firebase Hosting forwards to Cloud Run, which serves the custom domain. The
 * sign-in flow cookie reuses it, so the name cannot carry the __Host- prefix; the attributes
 * below are the ones that prefix would have enforced.
 */
export const SESSION_COOKIE_NAME = '__session';

export interface SessionCookie {
  name: string;
  options: Omit<CookieOptions, 'maxAge'>;
}

/** Tests and production use Secure cookies; only local HTTP development opts out. */
export function sessionCookie(
  env: Record<string, string | undefined>,
): SessionCookie {
  const development = env.NODE_ENV === 'development';
  return {
    name: SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: !development,
      sameSite: 'lax',
      path: '/',
    },
  };
}
