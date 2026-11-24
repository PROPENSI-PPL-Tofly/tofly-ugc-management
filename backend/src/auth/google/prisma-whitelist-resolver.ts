import { jakartaDay } from '../../creators/evergreen.js';
import { creatorMaySignIn, type BegunInvoice } from './creator-access.js';
import type { Principal, WhitelistResolver } from './ports.js';

type WhitelistUserRecord = {
  id: string;
  is_admin: boolean;
  creators: {
    id: string;
    contracts: { end_date: Date; invoice: BegunInvoice }[];
  } | null;
};

type WhitelistPrismaClient = {
  users: {
    findUnique(args: {
      where: { email: string } | { id: string };
      select: typeof USER_SELECT;
    }): Promise<WhitelistUserRecord | null>;
  };
};

/**
 * The user and, for a creator, every contract with its invoice: one call for a sign-in and for
 * each request a session makes, as before the rule read contracts (PRD 3.1).
 */
const USER_SELECT = {
  id: true,
  is_admin: true,
  creators: {
    select: {
      id: true,
      contracts: {
        select: {
          end_date: true,
          invoice: { select: { status: true, paid_at: true } },
        },
      },
    },
  },
} as const;

export class PrismaWhitelistResolver implements WhitelistResolver {
  constructor(private readonly prisma: WhitelistPrismaClient) {}

  resolve(email: string): Promise<Principal | null> {
    return this.lookup({ email });
  }

  /** The same answer for a signed-in user, asked again on every request their session makes. */
  resolveUser(userId: string): Promise<Principal | null> {
    return this.lookup({ id: userId });
  }

  private async lookup(
    where: { email: string } | { id: string },
  ): Promise<Principal | null> {
    const user = await this.prisma.users.findUnique({ where, select: USER_SELECT });

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

    // Access follows the contracts (PRD Sprint 4, rule 1): an early end, a cancelled invoice or
    // a paid last invoice closes it on the creator's next request.
    const contracts = creator.contracts.map((contract) => ({
      endDay: contract.end_date.toISOString().slice(0, 10),
      invoice: contract.invoice,
    }));
    if (!creatorMaySignIn(jakartaDay(new Date()), contracts)) {
      return null;
    }

    return {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };
  }
}
