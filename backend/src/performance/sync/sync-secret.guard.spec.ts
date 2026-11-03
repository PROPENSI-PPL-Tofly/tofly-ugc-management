import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import {
  MIN_SYNC_SECRET_LENGTH,
  SYNC_SECRET_HEADER,
  SyncSecretGuard,
} from './sync-secret.guard.js';

const SECRET = 'a'.repeat(MIN_SYNC_SECRET_LENGTH);

function context(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function refusal(guard: SyncSecretGuard, headers: Record<string, unknown>) {
  try {
    guard.canActivate(context(headers));
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('SyncSecretGuard', () => {
  it('lets the scheduler through with the configured secret', () => {
    expect(
      new SyncSecretGuard(SECRET).canActivate(
        context({ [SYNC_SECRET_HEADER]: SECRET }),
      ),
    ).toBe(true);
  });

  it('reads the header Cloud Scheduler sends, in the lower case Node gives it', () => {
    expect(SYNC_SECRET_HEADER).toBe('x-sync-secret');
  });

  it.each([
    ['no header', {}],
    ['an empty header', { [SYNC_SECRET_HEADER]: '' }],
    [
      'a wrong secret',
      { [SYNC_SECRET_HEADER]: 'b'.repeat(MIN_SYNC_SECRET_LENGTH) },
    ],
    ['a secret one character short', { [SYNC_SECRET_HEADER]: SECRET.slice(1) }],
    ['the secret sent twice', { [SYNC_SECRET_HEADER]: [SECRET, SECRET] }],
  ])('refuses %s with 401, naming no reason (OWASP A07)', (_, headers) => {
    const error = refusal(new SyncSecretGuard(SECRET), headers);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      code: 'SYNC_SECRET_INVALID',
      message: 'Unauthorized',
    });
  });

  it.each([
    ['unset', undefined],
    ['blank', '   '],
    ['shorter than 32 characters', 'x'.repeat(MIN_SYNC_SECRET_LENGTH - 1)],
  ])(
    'refuses every request when the secret is %s, so a missing setting never opens the route',
    (_, secret) => {
      const guard = new SyncSecretGuard(secret);

      expect(
        refusal(guard, { [SYNC_SECRET_HEADER]: secret ?? '' }),
      ).toBeInstanceOf(UnauthorizedException);
      expect(refusal(guard, {})).toBeInstanceOf(UnauthorizedException);
    },
  );

  it('ignores spaces around the configured secret, as Secret Manager may keep a newline', () => {
    expect(
      new SyncSecretGuard(`${SECRET}\n`).canActivate(
        context({ [SYNC_SECRET_HEADER]: SECRET }),
      ),
    ).toBe(true);
  });
});
