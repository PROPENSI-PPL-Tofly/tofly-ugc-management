import type { ExecutionContext } from '@nestjs/common';
import {
  mockCreatorId,
  mockCurrentCreatorId,
} from './creator-identity.mock.js';

function contextFor(creatorId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ creatorId }),
    }),
  } as unknown as ExecutionContext;
}

describe('mockCreatorId', () => {
  const VALID_CREATOR = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';

  it('returns undefined when development auth is disabled', () => {
    expect(
      mockCreatorId(VALID_CREATOR, {
        DEV_AUTH_ENABLED: 'false',
        NODE_ENV: 'development',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for an invalid creator UUID', () => {
    expect(
      mockCreatorId('not-a-uuid', {
        DEV_AUTH_ENABLED: 'true',
        NODE_ENV: 'development',
      }),
    ).toBeUndefined();
  });
});

describe('mockCurrentCreatorId', () => {
  it('throws 401 when a controller forgot to establish creator identity', () => {
    expect(() => mockCurrentCreatorId(undefined, contextFor())).toThrow(
      expect.objectContaining({
        status: 401,
      }),
    );
  });

  it('returns the creator identity established by the guard', () => {
    const creatorId = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';

    expect(mockCurrentCreatorId(undefined, contextFor(creatorId))).toBe(
      creatorId,
    );
  });
});
