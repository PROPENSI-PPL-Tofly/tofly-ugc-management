// TODO(PBI-9): replace with real Google OAuth session once auth lands.
//
// DEV-ONLY STAND-IN FOR AUTHENTICATION. Nothing here proves who the caller is.
//
// PBI-9 (Google OAuth + whitelist) has not been built, but the creator-facing endpoints
// need to know which creator is asking. This guard fills that gap with the exact shape a
// real session will provide — `request.user.creatorId` — so that swapping in real auth is
// a change to this file (and the module that provides it), not to every controller.
//
// It is off unless DEV_AUTH_ENABLED=true. Production never sets that, so a deployed backend
// answers these routes with 401 instead of letting anyone claim to be any creator.
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

/** Lets a local caller act as a different seeded creator without restarting the API. */
export const DEV_CREATOR_HEADER = 'x-dev-creator-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a signed-in creator looks like to a handler. Real auth must fill in the same shape. */
export interface AuthenticatedCreator {
  creatorId: string;
}

export interface RequestWithCreator {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedCreator;
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'Silakan masuk sebagai creator',
  });
}

// The coverage hint covers a branch the compiler emits for decorator metadata, not one
// written here (see CreatorsController).
/* v8 ignore start */
@Injectable()
/* v8 ignore stop */
export class DevCreatorGuard implements CanActivate {
  private readonly logger = new Logger(DevCreatorGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // TODO(PBI-9): replace with real Google OAuth session once auth lands.
    if (this.config.get<string>('DEV_AUTH_ENABLED') !== 'true')
      throw unauthorized();

    const request = context.switchToHttp().getRequest<RequestWithCreator>();
    const header = request.headers[DEV_CREATOR_HEADER];
    const claimed =
      (Array.isArray(header) ? header[0] : header) ??
      this.config.get<string>('DEV_CREATOR_ID');

    if (!claimed || !UUID.test(claimed)) throw unauthorized();

    const creator = await this.prisma.creator.findUnique({
      where: { id: claimed },
      select: { id: true },
    });
    if (!creator) {
      this.logger.warn(`Dev auth: creator ${claimed} does not exist`);
      throw unauthorized();
    }

    request.user = { creatorId: creator.id };
    return true;
  }
}
