import { jakartaDay } from '../../creators/evergreen.js';
import { creatorMaySignIn, type BegunInvoice } from './creator-access.js';
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
      where: { email: string } | { id: string };
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
  contracts: {
    findMany(args: {
      where: { creator_id: string; start_date: { lte: Date } };
      select: { invoice: { select: { status: true; paid_at: true } } };
    }): Promise<{ invoice: BegunInvoice }[]>;
  };
};

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
    const user = await this.prisma.users.findUnique({
      where,
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

    // Access remains valid until the scheduled revoke date is reached, and past it while the
    // creator still has an invoice to settle (PBI-13). Only a revoked creator's invoices are read,
    // so every other request costs the one query it always did.
    // Stryker disable next-line ConditionalExpression: equivalent mutant. Without the null check, null <= "YYYY-MM-DD" compares 0 with NaN and is false, exactly what the check answers; it is there for the type checker.
    const revoked = revokeDay !== null && revokeDay <= today;
    if (
      revoked &&
      !creatorMaySignIn(
        revokeDay,
        today,
        await this.begunInvoices(creator.id, today),
      )
    ) {
      return null;
    }

    return {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };
  }

  /** The invoice of each of the creator's contracts that has begun by today, in one query. */
  private async begunInvoices(
    creatorId: string,
    today: string,
  ): Promise<BegunInvoice[]> {
    const contracts = await this.prisma.contracts.findMany({
      where: {
        creator_id: creatorId,
        start_date: { lte: new Date(`${today}T00:00:00.000Z`) },
      },
      select: { invoice: { select: { status: true, paid_at: true } } },
    });
    return contracts.map(({ invoice }) => invoice);
  }
}
