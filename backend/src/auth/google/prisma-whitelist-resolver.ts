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

export type WhitelistPrincipal = {
  userId: string;
  email: string;
  role: 'ADMIN' | 'CREATOR';
};

export class PrismaWhitelistResolver {
  constructor(private readonly prisma: WhitelistPrismaClient) {}

  async resolve(email: string): Promise<WhitelistPrincipal | null> {
    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    if (user.is_admin) {
      return {
        userId: user.id,
        email: user.email,
        role: 'ADMIN',
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

    return {
      userId: user.id,
      email: user.email,
      role: 'CREATOR',
    };
  }
}