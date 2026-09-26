import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { unauthenticated, type CreatorRequest } from './creator-request.js';

// Development stand-in for Google sign-in, which replaces this guard. Until then a local
// stack can act as a creator by naming them; nothing here is identity proof.

/** Node lower-cases incoming header names. */
export const DEV_CREATOR_HEADER = 'x-dev-creator-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (typeof claimed !== 'string' || !UUID.test(claimed)) {
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

/** Denies by default: every path that does not end in a known creator is a 401. */
@Injectable()
export class DevCreatorGuard implements CanActivate {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CreatorLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CreatorRequest>();
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
