import type { Principal, WhitelistResolver } from './ports.js';

type WhitelistUserRecord = {
  id: string;
  email: string;
  is_admin: boolean;
};

type CreatorRecord = {
  id: string;
  user_id: string;
  access_revoke_date: Date | null;
  contracts: {
    start_date: Date;
    end_date: Date;
  }[];
};

type WhitelistPrismaClient = {
  users: {
    findUnique(args: {
      where: {
        email: string;
      };
    }): Promise<WhitelistUserRecord | null>;
  };
  creators: {
    findUnique(args: {
      where: {
        user_id: string;
      };
      include: {
        contracts: true;
      };
    }): Promise<CreatorRecord | null>;
  };
};

export class PrismaWhitelistResolver implements WhitelistResolver {
  constructor(private readonly prisma: WhitelistPrismaClient) {}

  async resolve(email: string): Promise<Principal | null> {
    const user = await this.prisma.users.findUnique({
      where: { email },
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
    const creator = await this.prisma.creators.findUnique({
      where: {
        user_id: user.id,
      },
      include: {
        contracts: true,
      },
    });

    if (!creator) {
      return null;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Access remains valid until the scheduled revoke date is reached.
    if (
      creator.access_revoke_date !== null &&
      creator.access_revoke_date <= today
    ) {
      return null;
    }

    // Access requires at least one contract that is active today.
    const hasActiveContract = creator.contracts.some((contract) => {
      const startDate = new Date(contract.start_date);
      const endDate = new Date(contract.end_date);

      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(0, 0, 0, 0);

      return startDate <= today && today <= endDate;
    });

    if (!hasActiveContract) {
      return null;
    }

    return {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };
  }
}