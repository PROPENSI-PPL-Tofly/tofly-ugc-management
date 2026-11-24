import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AdminRequest } from './admin.guard.js';
import type { Principal } from './google/ports.js';
import type { AppSessionService } from './session/session.service.js';
import { SuperAdminGuard } from './super-admin.guard.js';

// SCRUM-245 (PBI-23): "Pengguna Admin", "Log Aktivitas" and "Atur Buffer Deadline" are for Super
// Admin only; every other caller gets 403 (OWASP A01:2025 Broken Access Control).

const COOKIE = '__session';
const SESSION: Principal = { userId: 'user-admin', role: 'admin' };
const SUPER: Principal = {
  userId: 'user-admin',
  role: 'admin',
  adminRole: 'super_admin',
};
const ADMIN: Principal = {
  userId: 'user-admin',
  role: 'admin',
  adminRole: 'admin',
};
const CREATOR: Principal = {
  userId: 'user-creator',
  role: 'creator',
  creatorId: 'creator-1',
};

function context(request: AdminRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ cookie: vi.fn() }),
    }),
  } as unknown as ExecutionContext;
}

/** The session resolves to `session`; the whitelist, asked on each request, answers `current`. */
function setup(session: Principal | null, current: Principal | null) {
  const sessions = {
    cookieName: vi.fn(() => COOKIE),
    authenticate: vi.fn().mockResolvedValue(session),
  };
  const access = { resolveUser: vi.fn().mockResolvedValue(current) };
  const guard = new SuperAdminGuard(
    sessions as unknown as AppSessionService,
    access,
  );
  return { access, guard };
}

function signedIn(): AdminRequest {
  return { headers: {}, cookies: { [COOKIE]: 'opaque-id' }, method: 'GET' };
}

function refusal(attempt: Promise<unknown>) {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('SuperAdminGuard', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits a Super Admin and hands the route their current role', async () => {
    const { access, guard } = setup(SESSION, SUPER);
    const request = signedIn();

    await expect(guard.canActivate(context(request))).resolves.toBe(true);

    expect(access.resolveUser).toHaveBeenCalledWith('user-admin');
    expect(request.principal).toEqual(SUPER);
  });

  it('answers 403 to an Admin, with a message for Super Admin pages', async () => {
    const { guard } = setup(SESSION, ADMIN);
    const request = signedIn();

    const error = await refusal(guard.canActivate(context(request)));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      code: 'FORBIDDEN',
      message: 'Halaman ini hanya untuk Super Admin',
    });
  });

  // The role is read again on each request, so a demoted Super Admin loses these pages at once.
  it('answers 403 once the role was changed to Admin since sign-in', async () => {
    const { guard } = setup(SESSION, ADMIN);

    await expect(
      refusal(guard.canActivate(context(signedIn()))),
    ).resolves.toBeInstanceOf(ForbiddenException);
  });

  it('answers 403 to a creator', async () => {
    const { guard } = setup(CREATOR, CREATOR);

    await expect(
      refusal(guard.canActivate(context(signedIn()))),
    ).resolves.toBeInstanceOf(ForbiddenException);
  });

  it('answers 401 when the Admin was deactivated since sign-in', async () => {
    const { guard } = setup(SESSION, null);

    await expect(
      refusal(guard.canActivate(context(signedIn()))),
    ).resolves.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 401 without a session', async () => {
    const { guard } = setup(null, null);

    await expect(
      refusal(guard.canActivate(context(signedIn()))),
    ).resolves.toBeInstanceOf(UnauthorizedException);
  });

  // Mirrors AdminGuard's local stand-in, which only a non-production backend ever honours.
  it('lets a request without a cookie through only under the development stand-in', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const { guard } = setup(null, null);

    await expect(
      guard.canActivate(context({ headers: {}, method: 'GET' })),
    ).resolves.toBe(true);

    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      refusal(guard.canActivate(context({ headers: {}, method: 'GET' }))),
    ).resolves.toBeInstanceOf(UnauthorizedException);
  });
});
