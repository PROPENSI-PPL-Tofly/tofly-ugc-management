import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from './admin.guard.js';
import type { Principal } from './google/ports.js';
import type { AppSessionService } from './session/session.service.js';

const COOKIE = '__session';
const ADMIN: Principal = { userId: 'user-admin', role: 'admin' };
const CREATOR: Principal = {
  userId: 'user-creator',
  role: 'creator',
  creatorId: 'creator-1',
};

function context(request: AdminRequest, response = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

/**
 * A guard whose session resolves to `session` and whose whitelist, asked again on each
 * request, answers `current` (by default the same principal, still admitted).
 */
function setup(session: Principal | null, current: Principal | null = session) {
  const sessions = {
    cookieName: vi.fn(() => COOKIE),
    authenticate: vi.fn().mockResolvedValue(session),
  };
  const access = { resolveUser: vi.fn().mockResolvedValue(current) };
  const guard = new AdminGuard(
    sessions as unknown as AppSessionService,
    access,
  );
  return { sessions, access, guard };
}

function signedIn(method = 'GET'): AdminRequest {
  return { headers: {}, cookies: { [COOKIE]: 'opaque-id' }, method };
}

function refusal(attempt: Promise<unknown>) {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits a live admin session the whitelist still admits, renewing it', async () => {
    const { sessions, access, guard } = setup(ADMIN);
    const request = signedIn();
    const response = { cookie: vi.fn() };

    await expect(guard.canActivate(context(request, response))).resolves.toBe(
      true,
    );

    expect(sessions.authenticate).toHaveBeenCalledWith('opaque-id', response);
    expect(access.resolveUser).toHaveBeenCalledWith('user-admin');
    expect(request.principal).toEqual(ADMIN);
  });

  it('answers 403 to a signed-in creator', async () => {
    const { guard } = setup(CREATOR);
    const request = signedIn();

    const error = await refusal(guard.canActivate(context(request)));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      code: 'FORBIDDEN',
      message: 'Halaman ini hanya untuk Admin',
    });
    expect(request.principal).toBeUndefined();
  });

  it.each([
    ['no session cookie', { headers: {}, method: 'GET' }],
    ['a session the store refuses', signedIn()],
  ])('answers 401 for %s', async (_label, request: AdminRequest) => {
    const { guard } = setup(null);

    const error = await refusal(guard.canActivate(context(request)));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
  });

  // PRD 3.1: a session lasts until sign-out or until access is revoked.
  it.each([
    ['removed from the whitelist', null],
    ['no longer an admin', CREATOR],
  ])('answers 401 once the user is %s', async (_label, current) => {
    const { guard } = setup(ADMIN, current);
    const request = signedIn();

    const error = await refusal(guard.canActivate(context(request)));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(request.principal).toBeUndefined();
  });

  it('refuses a cross-site change before looking at the session (OWASP A01)', async () => {
    const { sessions, guard } = setup(ADMIN);
    const request = {
      ...signedIn('POST'),
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    };

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it('treats a request without a method as a change, so the origin is checked', async () => {
    const { sessions, guard } = setup(ADMIN);
    const request: AdminRequest = {
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
      cookies: { [COOKIE]: 'opaque-id' },
    };

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it('admits a same-origin change from the app', async () => {
    const { guard } = setup(ADMIN);
    const request = {
      ...signedIn('PATCH'),
      headers: {
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
  });

  it.each([
    [
      'the session store',
      () => new AdminGuard(undefined, { resolveUser: vi.fn() }),
    ],
    [
      'the whitelist check',
      () =>
        new AdminGuard(
          setup(ADMIN).sessions as unknown as AppSessionService,
          undefined,
        ),
    ],
  ])('fails closed without %s', async (_label, build) => {
    await expect(
      build().canActivate(context(signedIn())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('development stand-in', () => {
    it('lets a local request without a session through when DEV_AUTH_ENABLED is "true"', async () => {
      vi.stubEnv('DEV_AUTH_ENABLED', 'true');
      const { sessions, guard } = setup(null);

      await expect(
        guard.canActivate(context({ headers: {}, method: 'GET' })),
      ).resolves.toBe(true);
      expect(sessions.authenticate).not.toHaveBeenCalled();
    });

    it('never applies in production', async () => {
      vi.stubEnv('DEV_AUTH_ENABLED', 'true');
      vi.stubEnv('NODE_ENV', 'production');
      const { guard } = setup(null);

      await expect(
        guard.canActivate(context({ headers: {}, method: 'GET' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not rescue a request that sent a bad session cookie', async () => {
      vi.stubEnv('DEV_AUTH_ENABLED', 'true');
      const { guard } = setup(null);

      await expect(
        guard.canActivate(context(signedIn())),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
