import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { CreatorRequest } from './creator-request.js';
import { currentCreatorId } from './current-creator.decorator.js';

function context(request: CreatorRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('currentCreatorId', () => {
  it('reads the creator the guard recorded', () => {
    const creatorId = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';

    expect(
      currentCreatorId(undefined, context({ headers: {}, creatorId })),
    ).toBe(creatorId);
  });

  it('fails closed with 401 when a route forgot the guard', () => {
    expect(() => currentCreatorId(undefined, context({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});
