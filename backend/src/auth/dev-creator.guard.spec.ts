import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { CreatorRequest } from './creator-request.js';
import type { AppSessionService } from './session/session.service.js';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
  devCreatorId,
  type CreatorLookup,
} from './dev-creator.guard.js';

const HEADER_ID = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const ENV_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const ON = { DEV_AUTH_ENABLED: 'true' };

describe('devCreatorId', () => {
  it('takes the header when dev auth is on', () => {
    expect(devCreatorId(HEADER_ID, ON)).toBe(HEADER_ID);
  });

  it('falls back to DEV_CREATOR_ID when no header is sent', () => {
    expect(devCreatorId(undefined, { ...ON, DEV_CREATOR_ID: ENV_ID })).toBe(
      ENV_ID,
    );
  });

  it('prefers the header over DEV_CREATOR_ID', () => {
    expect(devCreatorId(HEADER_ID, { ...ON, DEV_CREATOR_ID: ENV_ID })).toBe(
      HEADER_ID,
    );
  });

  it('lower-cases the id so one creator has one spelling', () => {
    expect(devCreatorId(HEADER_ID.toUpperCase(), ON)).toBe(HEADER_ID);
  });

  it.each([
    ['unset', {}],
    ['anything but "true"', { DEV_AUTH_ENABLED: '1' }],
    ['on in production', { ...ON, NODE_ENV: 'production' }],
  ])('resolves nobody when dev auth is %s', (_label, env) => {
    expect(devCreatorId(HEADER_ID, { ...env, DEV_CREATOR_ID: ENV_ID })).toBe(
      undefined,
    );
  });

  it.each([
    ['nothing at all', undefined],
    ['an empty header', ''],
    ['a non-UUID', 'creator-1'],
    ['a UUID with a trailing payload', `${HEADER_ID}' OR '1'='1`],
    ['a UUID with a leading payload', `x${HEADER_ID}`],
    ['a repeated header', [HEADER_ID, ENV_ID]],
    ['a header sent as a one-item list', [HEADER_ID]],
  ])('resolves nobody from %s', (_label, header) => {
    expect(devCreatorId(header, ON)).toBe(undefined);
  });
});

describe('DevCreatorGuard', () => {
  function context(request: CreatorRequest, response = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  function guard(found: { id: string } | null) {
    const client = {
      creators: { findUnique: vi.fn().mockResolvedValue(found) },
    } satisfies CreatorLookup;

    return { client, guard: new DevCreatorGuard(client) };
  }

  function sessionGuard(
    principal: Awaited<ReturnType<AppSessionService['authenticate']>>,
  ) {
    const sessions = {
      cookieName: vi.fn(() => '__Host-tofly_session'),
      authenticate: vi.fn().mockResolvedValue(principal),
    } as unknown as AppSessionService;

    const client = {
      creators: { findUnique: vi.fn() },
    } satisfies CreatorLookup;

    return {
      client,
      sessions,
      guard: new DevCreatorGuard(client, sessions),
    };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets a known creator through and records who they are', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');

    const { client, guard: subject } = guard({ id: HEADER_ID });

    const request: CreatorRequest = {
      headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
    };

    await expect(subject.canActivate(context(request))).resolves.toBe(true);

    expect(request.creatorId).toBe(HEADER_ID);
    expect(client.creators.findUnique).toHaveBeenCalledWith({
      where: { id: HEADER_ID },
      select: { id: true },
    });
  });

  it('answers 401 for an id that names no creator', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');

    const { guard: subject } = guard(null);

    const request: CreatorRequest = {
      headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
    };

    await expect(subject.canActivate(context(request))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(request.creatorId).toBeUndefined();
  });

  it('answers 401 without touching the database when dev auth is off', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');

    const { client, guard: subject } = guard({ id: HEADER_ID });

    const attempt = subject.canActivate(
      context({
        headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
      }),
    );

    await expect(attempt).rejects.toMatchObject({
      response: {
        code: 'UNAUTHENTICATED',
        message: 'Silakan masuk terlebih dahulu',
      },
    });

    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });

  it('authenticates a creator from the server session and renews it', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const principal = {
      userId: 'user-1',
      role: 'creator' as const,
      creatorId: HEADER_ID,
    };

    const { client, sessions, guard: subject } = sessionGuard(principal);
    const response = { cookie: vi.fn() };

    const request: CreatorRequest = {
      headers: {},
      cookies: { '__Host-tofly_session': 'opaque-id' },
      method: 'GET',
    };

    await expect(subject.canActivate(context(request, response))).resolves.toBe(
      true,
    );

    expect(request.principal).toEqual(principal);
    expect(request.creatorId).toBe(HEADER_ID);

    expect(sessions.authenticate).toHaveBeenCalledWith('opaque-id', response);

    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });

  it('uses the development identity when the configured session provider has no cookie', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');

    const { client, sessions, guard: subject } = sessionGuard(null);

    vi.mocked(client.creators.findUnique).mockResolvedValue({
      id: HEADER_ID,
    });

    const request: CreatorRequest = {
      headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
    };

    await expect(subject.canActivate(context(request))).resolves.toBe(true);

    expect(request.creatorId).toBe(HEADER_ID);
    expect(sessions.authenticate).not.toHaveBeenCalled();

    expect(client.creators.findUnique).toHaveBeenCalledWith({
      where: { id: HEADER_ID },
      select: { id: true },
    });
  });

  it('does not fall back to the development identity when a supplied session is invalid', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');

    const { client, sessions, guard: subject } = sessionGuard(null);

    const request: CreatorRequest = {
      headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
      cookies: { '__Host-tofly_session': 'malformed' },
      method: 'GET',
    };

    await expect(subject.canActivate(context(request))).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });

    expect(sessions.authenticate).toHaveBeenCalledWith(
      'malformed',
      expect.anything(),
    );

    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an admin principal on a creator-only route', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { guard: subject } = sessionGuard({
      userId: 'admin-1',
      role: 'admin',
    });

    await expect(
      subject.canActivate(
        context({
          headers: {},
          cookies: { '__Host-tofly_session': 'opaque-id' },
          method: 'GET',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('does not authenticate when session storage fails', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { sessions, guard: subject } = sessionGuard(null);

    vi.mocked(sessions.authenticate).mockRejectedValue(
      new Error('database offline'),
    );

    const request: CreatorRequest = {
      headers: {},
      cookies: { '__Host-tofly_session': 'opaque-id' },
      method: 'GET',
    };

    await expect(subject.canActivate(context(request))).rejects.toThrow(
      'database offline',
    );

    expect(request.principal).toBeUndefined();
    expect(request.creatorId).toBeUndefined();
  });

  it('allows a same-origin session-authenticated mutation', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');

    const principal = {
      userId: 'user-1',
      role: 'creator' as const,
      creatorId: HEADER_ID,
    };

    const { sessions, guard: subject } = sessionGuard(principal);

    const request: CreatorRequest = {
      headers: {
        origin: 'https://tofly.example',
        'sec-fetch-site': 'same-origin',
      },
      cookies: { '__Host-tofly_session': 'opaque-id' },
      method: 'POST',
    };

    await expect(subject.canActivate(context(request))).resolves.toBe(true);

    expect(request.principal).toEqual(principal);
    expect(request.creatorId).toBe(HEADER_ID);

    expect(sessions.authenticate).toHaveBeenCalledWith(
      'opaque-id',
      expect.anything(),
    );
  });

  it('allows a same-origin session-authenticated request when method is omitted', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');

    const principal = {
      userId: 'user-1',
      role: 'creator' as const,
      creatorId: HEADER_ID,
    };

    const { sessions, guard: subject } = sessionGuard(principal);

    const request: CreatorRequest = {
      headers: {
        origin: 'https://tofly.example',
        'sec-fetch-site': 'same-origin',
      },
      cookies: { '__Host-tofly_session': 'opaque-id' },
    };

    await expect(subject.canActivate(context(request))).resolves.toBe(true);

    expect(request.principal).toEqual(principal);
    expect(request.creatorId).toBe(HEADER_ID);

    expect(sessions.authenticate).toHaveBeenCalledWith(
      'opaque-id',
      expect.anything(),
    );
  });

  it('checks the request origin before allowing a session-authenticated mutation', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');

    const principal = {
      userId: 'user-1',
      role: 'creator' as const,
      creatorId: HEADER_ID,
    };

    const { sessions, guard: subject } = sessionGuard(principal);

    const request: CreatorRequest = {
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
      cookies: { '__Host-tofly_session': 'opaque-id' },
      method: 'POST',
    };

    await expect(subject.canActivate(context(request))).rejects.toMatchObject({
      status: 403,
    });

    expect(request.principal).toBeUndefined();
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it('rejects production requests without an application session', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { sessions, guard: subject } = sessionGuard(null);

    await expect(
      subject.canActivate(
        context({
          headers: {},
          method: 'GET',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });

    expect(sessions.authenticate).toHaveBeenCalledWith(
      undefined,
      expect.anything(),
    );
  });

  it('fails closed in production when the session provider is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { client, guard: subject } = guard({ id: HEADER_ID });

    await expect(
      subject.canActivate(
        context({
          headers: {},
          method: 'GET',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });

    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when a session cookie is supplied but the session provider is unavailable', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');

    const { client, guard: subject } = guard({ id: HEADER_ID });

    const request: CreatorRequest = {
      headers: { [DEV_CREATOR_HEADER]: HEADER_ID },
      cookies: { '': 'opaque-id' },
      method: 'GET',
    };

    await expect(subject.canActivate(context(request))).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });

    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });
});
