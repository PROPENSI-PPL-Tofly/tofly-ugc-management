import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import { unauthenticated } from './creator-request.js';
import type { Principal } from './google/ports.js';
import { assertSameOrigin } from './same-origin.js';
import { ACCESS_CHECK, type AccessCheck } from './session/access-check.js';
import { AppSessionService } from './session/session.service.js';

/** The part of an HTTP request the admin guard touches; cookie-parser fills `cookies`. */
export interface AdminRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  cookies?: Record<string, unknown>;
  principal?: Principal;
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'Halaman ini hanya untuk Admin',
  });
}

/**
 * Admin-only routes: the Creator Database, content scheduling and draft review. Admits a live
 * admin session whose user the whitelist still admits as an admin (PRD 3.1), so demoting or
 * removing an admin ends their access on the next request. Mirrors DevCreatorGuard, including
 * its local stand-in: with DEV_AUTH_ENABLED="true" and no session cookie, a non-production
 * backend lets the request through, as every admin route did before sign-in existed.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(AppSessionService)
    private readonly sessions?: AppSessionService,
    @Optional()
    @Inject(ACCESS_CHECK)
    private readonly access?: AccessCheck,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookieId = request.cookies?.[this.sessions?.cookieName() ?? ''];

    if (
      cookieId === undefined &&
      process.env.NODE_ENV !== 'production' &&
      process.env.DEV_AUTH_ENABLED === 'true'
    ) {
      return true;
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '')) {
      assertSameOrigin(request);
    }
    const principal = await this.sessions?.authenticate(
      cookieId,
      context.switchToHttp().getResponse<Response>(),
    );
    if (!principal) {
      throw unauthenticated();
    }
    if (principal.role !== 'admin') {
      throw forbidden();
    }
    const current = await this.access?.resolveUser(principal.userId);
    if (current?.role !== 'admin') {
      throw unauthenticated();
    }
    request.principal = principal;
    return true;
  }
}
