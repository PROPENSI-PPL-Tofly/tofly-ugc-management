type WhitelistUserRecord = {
  id: string;
  email: string;
  is_admin: boolean;
};

type WhitelistPrismaClient = {
  users: {
    findUnique(args: {
      where: {
        email: string;
      };
    }): Promise<WhitelistUserRecord | null>;
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

    return null;
  }
}