import {
  loginCodeSecret,
  MIN_LOGIN_CODE_SECRET_LENGTH,
  requireLoginCodeSecretInProduction,
} from './login-code-config.js';

const SECRET = 'x'.repeat(MIN_LOGIN_CODE_SECRET_LENGTH);

describe('loginCodeSecret', () => {
  it('reads the trimmed secret', () => {
    expect(loginCodeSecret({ LOGIN_CODE_SECRET: ` ${SECRET} ` })).toBe(SECRET);
  });

  it.each([
    ['unset', undefined],
    ['blank', '   '],
    ['too short to resist guessing', 'x'.repeat(31)],
  ])('reads no secret when it is %s', (_label, value) => {
    expect(loginCodeSecret({ LOGIN_CODE_SECRET: value })).toBeUndefined();
  });
});

describe('requireLoginCodeSecretInProduction', () => {
  it('stops a production boot without a usable secret', () => {
    expect(() =>
      requireLoginCodeSecretInProduction({ NODE_ENV: 'production' }),
    ).toThrow('Missing required env var: LOGIN_CODE_SECRET');
  });

  it('lets production boot with one', () => {
    expect(() =>
      requireLoginCodeSecretInProduction({
        NODE_ENV: 'production',
        LOGIN_CODE_SECRET: SECRET,
      }),
    ).not.toThrow();
  });

  it('leaves development and tests free to run without one', () => {
    expect(() =>
      requireLoginCodeSecretInProduction({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});
