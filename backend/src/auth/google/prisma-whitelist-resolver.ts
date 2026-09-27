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

export class PrismaWhitelistResolver {
  constructor(private readonly prisma: WhitelistPrismaClient) {}

  async resolve(email: string): Promise<WhitelistUserRecord | null> {
    return this.prisma.users.findUnique({
      where: { email },
    });
  }
}