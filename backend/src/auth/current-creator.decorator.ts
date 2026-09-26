import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { unauthenticated, type CreatorRequest } from './creator-request.js';

/** Exported apart from the decorator so it can be tested directly. */
export function currentCreatorId(
  _data: unknown,
  context: ExecutionContext,
): string {
  const { creatorId } = context.switchToHttp().getRequest<CreatorRequest>();
  // A route that forgot its guard fails closed instead of querying with no creator.
  if (!creatorId) {
    throw unauthenticated();
  }
  return creatorId;
}

/** The calling creator's id, as recorded by the creator identity guard. */
export const CurrentCreator = createParamDecorator(currentCreatorId);
