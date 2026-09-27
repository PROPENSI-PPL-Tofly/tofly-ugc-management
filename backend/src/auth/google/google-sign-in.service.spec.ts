import type { Response } from 'express';
import { TokenExchangeError } from './google-token-client.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import type { OAuthFlow } from './oauth-flow.js';
import type { Principal } from './ports.js';
import { landingPath, loginErrorPath } from './redirects.js';

const FLOW: OAuthFlow = {
  state: 's'.repeat(43),
  nonce: 'n'.repeat(43),
  verifier: 'v'.repeat(43),
};
const CODE = '4/0AVG7fiQ-example-code';
const ID_TOKEN = 'header.payload.signature';
const EMAIL = 'dina@example.com';
const ADMIN: Principal = { userId: 'user-1', role: 'admin' };
const CREATOR: Principal = {
  userId: 'user-2',
  role: 'creator',
  creatorId: 'creator-2',
};
const RESPONSE = {} as Response;

function setup(
  overrides: {
    exchange?: () => Promise<string>;
    verify?: () => Promise<{ sub: string; email: string }>;
    resolve?: () => Promise<Principal | null>;
    start?: () => Promise<void>;
  } = {},
) {
  const exchanger = {
    exchange: vi.fn(overrides.exchange ?? (() => Promise.resolve(ID_TOKEN))),
  };
  const verifier = {
    verify: vi.fn(
      overrides.verify ?? (() => Promise.resolve({ sub: 'g-1', email: EMAIL })),
    ),
  };
  const whitelist = {
    resolve: vi.fn(overrides.resolve ?? (() => Promise.resolve(ADMIN))),
  };
  const session = {
    start: vi.fn(overrides.start ?? (() => Promise.resolve())),
  };
  const logger = { warn: vi.fn() };
  const service = new GoogleSignInService(
    exchanger,
    verifier,
    whitelist,
    session,
    logger,
  );
  return { exchanger, verifier, whitelist, session, logger, service };
}

describe('landingPath / loginErrorPath', () => {
  it('sends an admin to the Creator Database and a creator to Task Saya', () => {
    expect(landingPath(ADMIN)).toBe('/admin/creators');
    expect(landingPath(CREATOR)).toBe('/creator/tasks');
  });

  it.each(['not_authorized', 'sign_in_failed', 'cancelled'] as const)(
    'sends %s back to the login page with its code',
    (code) => {
      expect(loginErrorPath(code)).toBe(`/login?error=${code}`);
    },
  );
});

describe('GoogleSignInService.complete', () => {
  it('signs a whitelisted admin in and lands them on their page', async () => {
    const { exchanger, verifier, whitelist, session, logger, service } =
      setup();

    await expect(service.complete(CODE, FLOW, RESPONSE)).resolves.toBe(
      '/admin/creators',
    );

    expect(exchanger.exchange).toHaveBeenCalledWith(CODE, FLOW.verifier);
    expect(verifier.verify).toHaveBeenCalledWith(ID_TOKEN, FLOW.nonce);
    expect(whitelist.resolve).toHaveBeenCalledWith(EMAIL);
    expect(session.start).toHaveBeenCalledWith(RESPONSE, ADMIN);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('lands a whitelisted creator on Task Saya', async () => {
    const { service } = setup({ resolve: () => Promise.resolve(CREATOR) });

    await expect(service.complete(CODE, FLOW, RESPONSE)).resolves.toBe(
      '/creator/tasks',
    );
  });

  it('turns away an email that is not whitelisted without starting a session', async () => {
    const { session, logger, service } = setup({
      resolve: () => Promise.resolve(null),
    });

    await expect(service.complete(CODE, FLOW, RESPONSE)).resolves.toBe(
      '/login?error=not_authorized',
    );
    expect(session.start).not.toHaveBeenCalled();
    // The address is personal data; the log says what happened, not to whom.
    expect(logger.warn).toHaveBeenCalledWith(
      'Google sign-in refused: email not whitelisted',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(EMAIL);
  });

  it.each([
    [
      'the code exchange fails',
      {
        exchange: () =>
          Promise.reject(new TokenExchangeError('token endpoint answered 400')),
      },
      'Google sign-in failed: token endpoint answered 400',
    ],
    [
      'the ID token is rejected',
      { verify: () => Promise.reject(new Error(`bad token for ${EMAIL}`)) },
      'Google sign-in failed: Error',
    ],
    [
      'the whitelist lookup fails',
      { resolve: () => Promise.reject(new TypeError('db down')) },
      'Google sign-in failed: TypeError',
    ],
    [
      'the session cannot start',
      { start: () => Promise.reject(new Error('not implemented')) },
      'Google sign-in failed: Error',
    ],
    [
      'something throws a non-error',
      { verify: () => Promise.reject('boom') },
      'Google sign-in failed: unknown error',
    ],
  ])(
    'fails the sign-in when %s, logging only a safe reason',
    async (_label, overrides, logged) => {
      const { logger, service } = setup(overrides);

      await expect(service.complete(CODE, FLOW, RESPONSE)).resolves.toBe(
        '/login?error=sign_in_failed',
      );
      expect(logger.warn).toHaveBeenCalledWith(logged);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(EMAIL);
    },
  );

  it('does not ask the whitelist about an identity the verifier rejected', async () => {
    const { whitelist, session, service } = setup({
      verify: () => Promise.reject(new Error('expired')),
    });

    await service.complete(CODE, FLOW, RESPONSE);

    expect(whitelist.resolve).not.toHaveBeenCalled();
    expect(session.start).not.toHaveBeenCalled();
  });
});
