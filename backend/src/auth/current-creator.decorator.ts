import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedCreator,
  RequestWithCreator,
} from './dev-creator.guard.js';

/**
 * The signed-in creator's id, as put on the request by the auth guard.
 *
 * TODO(PBI-9): replace with real Google OAuth session once auth lands. Today the guard is
 * DevCreatorGuard; real auth only has to leave `request.user.creatorId` in the same place.
 */
export function creatorIdFrom(
  _data: unknown,
  context: ExecutionContext,
): string {
  const request = context.switchToHttp().getRequest<RequestWithCreator>();
  const user: AuthenticatedCreator | undefined = request.user;
  // A handler using this without the guard in front of it is a wiring bug, not a bad request.
  if (!user)
    throw new Error('CurrentCreator used on a route without an auth guard');
  return user.creatorId;
}

export const CurrentCreator = createParamDecorator(creatorIdFrom);
