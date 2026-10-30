import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { DevCreatorGuard } from './dev-creator.guard.js';

/**
 * A route both a creator and an admin may call, such as replacing a video link (PBI-38 AC 9).
 * The creator guard is asked first; a caller it turns away as not a creator is handed to the
 * admin guard, which decides alone (Chain of Responsibility). Each guard keeps every check it
 * has, the same-origin check and the whitelist re-read included, so neither can be skipped. A
 * creator on the route sets `creatorId`; an admin sets only `principal` (OWASP A01).
 */
@Injectable()
export class CreatorOrAdminGuard implements CanActivate {
  constructor(
    @Inject(DevCreatorGuard) private readonly creator: CanActivate,
    @Inject(AdminGuard) private readonly admin: CanActivate,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return Boolean(await this.creator.canActivate(context));
    } catch (error) {
      // Only "not a creator" passes the request on; a failing session store stays a failure.
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        return Boolean(await this.admin.canActivate(context));
      }
      throw error;
    }
  }
}
