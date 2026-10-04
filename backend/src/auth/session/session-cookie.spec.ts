import { sessionCookie } from './session-cookie.js';

describe('sessionCookie', () => {
  it('uses a Secure cookie named __session outside local development', () => {
    expect(sessionCookie({ NODE_ENV: 'production' })).toEqual({
      name: '__session',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    });
  });

  it('keeps the name and drops Secure for local HTTP development only', () => {
    expect(sessionCookie({ NODE_ENV: 'development' })).toEqual({
      name: '__session',
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      },
    });
  });
});
