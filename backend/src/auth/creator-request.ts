import { UnauthorizedException } from '@nestjs/common';

/**
 * The part of an HTTP request the creator identity touches. A guard resolves who is calling
 * and records it as `creatorId`; routes read it through @CurrentCreator(), so replacing the
 * guard with Google sign-in leaves every route as it is.
 */
export interface CreatorRequest {
  headers: Record<string, string | string[] | undefined>;
  creatorId?: string;
}

/** One answer for every identity failure, so a caller cannot tell which check refused them. */
export function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'Silakan masuk terlebih dahulu',
  });
}
