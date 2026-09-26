import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

// Stand-in for the creator identity guard in PR #48 (src/auth: DevCreatorGuard and
// @CurrentCreator). It reads the same header behind the same DEV_AUTH_ENABLED gate, so when #48
// is merged this file is deleted and the draft route switches to those two imports. Unlike
// DevCreatorGuard it does not check the creator exists; the draft service's ownership scope
// already answers 404 for an unknown one.

/** Node lower-cases incoming header names. */
export const MOCK_CREATOR_HEADER = 'x-dev-creator-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MockCreatorRequest {
  headers: Record<string, string | string[] | undefined>;
  creatorId?: string;
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'Silakan masuk terlebih dahulu',
  });
}

/** The creator a dev request claims to be; off unless DEV_AUTH_ENABLED is "true", never in production. */
export function mockCreatorId(
  header: string | string[] | undefined,
  env: Record<string, string | undefined>,
): string | undefined {
  if (env.DEV_AUTH_ENABLED !== 'true' || env.NODE_ENV === 'production') {
    return undefined;
  }
  if (typeof header !== 'string' || !UUID.test(header)) {
    return undefined;
  }
  return header.toLowerCase();
}

/** Denies by default: a request that does not name a creator is a 401. */
@Injectable()
export class MockCreatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MockCreatorRequest>();
    const creatorId = mockCreatorId(
      request.headers[MOCK_CREATOR_HEADER],
      process.env,
    );
    if (!creatorId) {
      throw unauthenticated();
    }
    request.creatorId = creatorId;
    return true;
  }
}

/** Exported apart from the decorator so it can be tested directly. */
export function mockCurrentCreatorId(
  _data: unknown,
  context: ExecutionContext,
): string {
  const { creatorId } = context.switchToHttp().getRequest<MockCreatorRequest>();
  // A route that forgot its guard fails closed instead of acting for no one.
  if (!creatorId) {
    throw unauthenticated();
  }
  return creatorId;
}

/** The calling creator's id, as recorded by MockCreatorGuard. */
export const MockCurrentCreator = createParamDecorator(mockCurrentCreatorId);
