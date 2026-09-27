import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'SESSION_COOKIE';
export const DEVELOPMENT_SESSION_COOKIE_NAME = 'tofly_session';
export const SECURE_SESSION_COOKIE_NAME = '__Host-tofly_session';

export interface SessionCookie {
  name: string;
  options: Omit<CookieOptions, 'maxAge'>;
}

/** Tests and production use secure host cookies; only local HTTP development opts out. */
export function sessionCookie(
  env: Record<string, string | undefined>,
): SessionCookie {
  const development = env.NODE_ENV === 'development';
  return {
    name: development
      ? DEVELOPMENT_SESSION_COOKIE_NAME
      : SECURE_SESSION_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: !development,
      sameSite: 'lax',
      path: '/',
    },
  };
}
