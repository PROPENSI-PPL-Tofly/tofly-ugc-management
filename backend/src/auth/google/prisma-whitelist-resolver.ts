import { jakartaDay } from '../../creators/evergreen.js';
import {
  creatorMaySignIn,
  onlyPaymentsLeft,
  type BegunInvoice,
} from './creator-access.js';
import type { AdminRole, Principal, WhitelistResolver } from './ports.js';

const ADMIN_ROLES: readonly unknown[] = [
  'admin',
  'super_admin',
] satisfies AdminRole[];

type WhitelistUserRecord = {
  id: string;
  name?: string | null;
  is_admin: boolean;
  admin_role: string | null;
  is_active: boolean;
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
  name: true,
  is_admin: true,
  admin_role: true,
  is_active: true,
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
    const user = await this.prisma.users.findUnique({
      where,
      select: USER_SELECT,
    });

    if (!user) {
      return null;
    }

    if (user.is_admin) {
      // PBI-23 (OWASP A01): a deactivated Admin is refused, and a role the app does not know is
      // never read as one it does; the database already ties every Admin to a role.
      if (!user.is_active || !ADMIN_ROLES.includes(user.admin_role)) {
        return null;
      }
      const name = user.name?.trim();
      return {
        userId: user.id,
        role: 'admin',
        adminRole: user.admin_role as AdminRole,
        ...(name && { name }),
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
    const today = jakartaDay(new Date());
    if (!creatorMaySignIn(today, contracts)) {
      return null;
    }

    return {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
      // PBI-37 (AC 13): only "Pembayaran" is left while an invoice waits.
      ...(onlyPaymentsLeft(today, contracts) && {
        paymentsOnly: true as const,
      }),
    };
  }
}
