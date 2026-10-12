import {
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUuid } from '../uuid.js';
import { assertSameOrigin } from './same-origin.js';
import { ACCESS_CHECK, type AccessCheck } from './session/access-check.js';
import { unauthenticated, type CreatorRequest } from './creator-request.js';
import { AppSessionService } from './session/session.service.js';

// Creator identity uses the application session; a strictly local header remains available
// for the existing development workflow.

/** Node lower-cases incoming header names. */
export const DEV_CREATOR_HEADER = 'x-dev-creator-id';

type Env = Record<string, string | undefined>;

/**
 * The creator a dev request claims to be, or undefined. Off unless DEV_AUTH_ENABLED is exactly
 * "true", and always off in production: the frontend proxy forwards browser headers, so a
 * deployed header switch would let anyone read any creator's work. The header wins over
 * DEV_CREATOR_ID so tests can switch creators without a restart.
 */
export function devCreatorId(
  header: string | string[] | undefined,
  env: Env,
): string | undefined {
  if (env.DEV_AUTH_ENABLED !== 'true' || env.NODE_ENV === 'production') {
    return undefined;
  }
  const claimed = header ?? env.DEV_CREATOR_ID;
  if (!isUuid(claimed)) {
    return undefined;
  }
  return claimed.toLowerCase();
}

/** The slice of Prisma the guard touches, so tests can stub exactly that. */
export interface CreatorLookup {
  creators: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
}

/** Resolves creator requests from a session, with a development-only fallback. */
@Injectable()
export class DevCreatorGuard implements CanActivate {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CreatorLookup,
    @Optional()
    @Inject(AppSessionService)
    private readonly sessions?: AppSessionService,
    @Optional()
    @Inject(ACCESS_CHECK)
    private readonly access?: AccessCheck,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CreatorRequest>();
    const cookieId = request.cookies?.[this.sessions?.cookieName() ?? ''];
    if (cookieId !== undefined || process.env.NODE_ENV === 'production') {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '')) {
        assertSameOrigin(request);
      }
      const principal = await this.sessions?.authenticate(
        cookieId,
        context.switchToHttp().getResponse<Response>(),
      );
      if (!principal || principal.role !== 'creator') {
        throw unauthenticated();
      }
      // PRD 3.1: a session lasts until sign-out or until access is revoked, so the whitelist
      // is asked again rather than trusting the role recorded at sign-in.
      const current = await this.access?.resolveUser(principal.userId);
      if (
        current?.role !== 'creator' ||
        current.creatorId !== principal.creatorId
      ) {
        throw unauthenticated();
      }
      request.principal = principal;
      request.creatorId = principal.creatorId;
      return true;
    }

    const creatorId = devCreatorId(
      request.headers[DEV_CREATOR_HEADER],
      process.env,
    );
    if (!creatorId) {
      throw unauthenticated();
    }

    const creator = await this.prisma.creators.findUnique({
      where: { id: creatorId },
      select: { id: true },
    });
    if (!creator) {
      throw unauthenticated();
    }

    request.creatorId = creator.id;
    return true;
  }
}
