import { jakartaDay } from '../../creators/evergreen.js';
import type { Principal, WhitelistResolver } from './ports.js';

type WhitelistUserRecord = {
  id: string;
  is_admin: boolean;
  creators: {
    id: string;
    access_revoke_date: Date | null;
  } | null;
};

type WhitelistPrismaClient = {
  users: {
    findUnique(args: {
      where: {
        email: string;
      };
      select: {
        id: true;
        is_admin: true;
        creators: {
          select: {
            id: true;
            access_revoke_date: true;
          };
        };
      };
    }): Promise<WhitelistUserRecord | null>;
  };
};

export class PrismaWhitelistResolver implements WhitelistResolver {
  constructor(private readonly prisma: WhitelistPrismaClient) {}

  async resolve(email: string): Promise<Principal | null> {
    const user = await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    if (user.is_admin) {
      return {
        userId: user.id,
        role: 'admin',
      };
    }

    // Non-admin users must have a creator profile before receiving creator access.
    const creator = user.creators;

    if (!creator) {
      return null;
    }

    const today = jakartaDay(new Date());

    // Postgres date values represent calendar days, so compare them as ISO dates.
    const revokeDay =
      creator.access_revoke_date?.toISOString().slice(0, 10) ?? null;

    // Access remains valid until the scheduled revoke date is reached.
    if (revokeDay !== null && revokeDay <= today) {
      return null;
    }

    return {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };
  }
}
