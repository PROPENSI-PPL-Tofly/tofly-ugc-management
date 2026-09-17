import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { creatorIdFrom } from './current-creator.decorator.js';
import {
  DevCreatorGuard,
  type RequestWithCreator,
} from './dev-creator.guard.js';

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function contextFor(request: RequestWithCreator): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(
  env: Record<string, string | undefined>,
  existing: string[] = [CREATOR_ID],
) {
  const config = {
    get: vi.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  const findUnique = vi.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(existing.includes(where.id) ? { id: where.id } : null),
  );
  const prisma = { creator: { findUnique } } as unknown as PrismaService;
  return { guard: new DevCreatorGuard(config, prisma), findUnique };
}

describe('DevCreatorGuard', () => {
  it('refuses every request unless dev auth is switched on', async () => {
    const { guard, findUnique } = guardWith({ DEV_CREATOR_ID: CREATOR_ID });

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('acts as the configured creator by default', async () => {
    const { guard } = guardWith({
      DEV_AUTH_ENABLED: 'true',
      DEV_CREATOR_ID: CREATOR_ID,
    });
    const request: RequestWithCreator = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ creatorId: CREATOR_ID });
  });

  it('lets a header pick a different creator', async () => {
    const { guard } = guardWith(
      { DEV_AUTH_ENABLED: 'true', DEV_CREATOR_ID: CREATOR_ID },
      [CREATOR_ID, OTHER_ID],
    );
    const request: RequestWithCreator = {
      headers: { 'x-dev-creator-id': [OTHER_ID] },
    };

    await guard.canActivate(contextFor(request));

    expect(request.user).toEqual({ creatorId: OTHER_ID });
  });

  it('refuses when no creator is named at all', async () => {
    const { guard } = guardWith({ DEV_AUTH_ENABLED: 'true' });

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a malformed id before it reaches the database', async () => {
    const { guard, findUnique } = guardWith({ DEV_AUTH_ENABLED: 'true' });

    await expect(
      guard.canActivate(
        contextFor({ headers: { 'x-dev-creator-id': 'not-a-uuid' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses a creator that does not exist', async () => {
    const { guard } = guardWith({
      DEV_AUTH_ENABLED: 'true',
      DEV_CREATOR_ID: OTHER_ID,
    });

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('creatorIdFrom', () => {
  it('reads the creator the guard put on the request', () => {
    expect(
      creatorIdFrom(
        undefined,
        contextFor({ headers: {}, user: { creatorId: CREATOR_ID } }),
      ),
    ).toBe(CREATOR_ID);
  });

  it('fails loudly when a route forgot the guard', () => {
    expect(() => creatorIdFrom(undefined, contextFor({ headers: {} }))).toThrow(
      /without an auth guard/,
    );
  });
});
