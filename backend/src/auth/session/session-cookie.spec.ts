import { sessionCookie } from './session-cookie.js';

describe('sessionCookie', () => {
  it('uses a Secure host-only cookie outside local development', () => {
    expect(sessionCookie({ NODE_ENV: 'production' })).toEqual({
      name: '__Host-tofly_session',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    });
  });

  it('uses a non-prefixed cookie for local HTTP development only', () => {
    expect(sessionCookie({ NODE_ENV: 'development' })).toEqual({
      name: 'tofly_session',
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      },
    });
  });
});
