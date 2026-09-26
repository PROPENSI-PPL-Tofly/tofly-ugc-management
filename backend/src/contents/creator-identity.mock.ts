import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

// Temporary stand-in for the creator identity guard from PBI-20's auth work.
// This is intentionally development-only and must never be enabled in production.

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

/**
 * Returns the development creator id only when explicitly enabled and never
 * when the application is running in production.
 */
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

/** Fails closed if a controller forgets to install the guard. */
export function mockCurrentCreatorId(
  _data: unknown,
  context: ExecutionContext,
): string {
  const { creatorId } = context.switchToHttp().getRequest<MockCreatorRequest>();

  if (!creatorId) {
    throw unauthenticated();
  }

  return creatorId;
}

export const MockCurrentCreator = createParamDecorator(mockCurrentCreatorId);