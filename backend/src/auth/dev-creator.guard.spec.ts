import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { CreatorRequest } from './creator-request.js';
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
    ['a repeated header', [HEADER_ID, ENV_ID]],
  ])('resolves nobody from %s', (_label, header) => {
    expect(devCreatorId(header, ON)).toBe(undefined);
  });
});

describe('DevCreatorGuard', () => {
  function context(request: CreatorRequest): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function guard(found: { id: string } | null) {
    const client = {
      creators: { findUnique: vi.fn().mockResolvedValue(found) },
    } satisfies CreatorLookup;
    return { client, guard: new DevCreatorGuard(client) };
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
      context({ headers: { [DEV_CREATOR_HEADER]: HEADER_ID } }),
    );

    await expect(attempt).rejects.toMatchObject({
      response: {
        code: 'UNAUTHENTICATED',
        message: 'Silakan masuk terlebih dahulu',
      },
    });
    expect(client.creators.findUnique).not.toHaveBeenCalled();
  });
});
