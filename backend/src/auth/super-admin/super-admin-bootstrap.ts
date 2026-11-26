// The first Super Admin (PBI-23, SCRUM-245): "the email set in server config for each environment
// (a developer account on staging, the Tofly account agreed for production). After that, roles
// change only in the app." So SUPER_ADMIN_EMAIL is acted on only while no Super Admin exists.

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EMAIL_FORMAT, MAX_EMAIL_LENGTH } from '../../creators/new-creator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BootstrapOutcome =
  'unset' | 'exists' | 'promoted' | 'created' | 'creator';

const INVALID = 'SUPER_ADMIN_EMAIL is not a valid email address';

/** The configured address, trimmed and lower-cased; null when unset. Throws when it is no address. */
export function superAdminEmail(raw: string | undefined): string | null {
  const email = raw?.trim().toLowerCase() ?? '';
  if (email === '') return null;
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(email)) {
    throw new Error(INVALID);
  }
  return email;
}

/** A Super Admin who can still sign in; a deactivated one leaves the environment without one. */
const ACTIVE_SUPER_ADMIN = { admin_role: 'super_admin', is_active: true } as const;

type BootstrapUsers = {
  count(args: { where: typeof ACTIVE_SUPER_ADMIN }): Promise<number>;
  findUnique(args: {
    where: { email: string };
    select: { id: true; creators: { select: { id: true } } };
  }): Promise<{ id: string; creators: { id: string } | null } | null>;
  update(args: {
    where: { id: string };
    data: { is_admin: true; admin_role: 'super_admin'; is_active: true };
  }): Promise<unknown>;
  create(args: {
    data: { email: string; is_admin: true; admin_role: 'super_admin' };
  }): Promise<unknown>;
};

type BootstrapClient = {
  users: {
    findFirst(args: {
      where: typeof ACTIVE_SUPER_ADMIN;
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  $transaction<T>(
    work: (tx: { users: BootstrapUsers }) => Promise<T>,
  ): Promise<T>;
};

type BootstrapLog = Pick<Logger, 'log' | 'warn'>;

function isDuplicate(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class SuperAdminBootstrap implements OnApplicationBootstrap {
  constructor(
    @Inject(PrismaService) private readonly prisma: BootstrapClient,
    @Optional()
    private readonly log: BootstrapLog = new Logger(SuperAdminBootstrap.name),
  ) {}

  /**
   * A wrong address or a database that is briefly away is logged, never fatal: the rest of the app
   * still has to start, and the next start tries again.
   */
  async onApplicationBootstrap(): Promise<void> {
    let email: string | null;
    try {
      email = superAdminEmail(process.env.SUPER_ADMIN_EMAIL);
    } catch {
      this.log.warn(`${INVALID}; no Super Admin was set`);
      return;
    }
    try {
      await this.ensure(email ?? undefined);
    } catch (error) {
      // A database error can quote the address, so only its class reaches the log (OWASP A09).
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.log.warn(`First Super Admin was not set (${reason})`);
    }
  }

  /** Makes the configured address the first Super Admin, unless one already exists. */
  async ensure(raw: string | undefined): Promise<BootstrapOutcome> {
    const email = superAdminEmail(raw);
    if (email === null) return 'unset';
    // Every start after the first ends here: one read, no transaction on the single connection.
    if (
      await this.prisma.users.findFirst({
        where: ACTIVE_SUPER_ADMIN,
        select: { id: true },
      })
    ) {
      return 'exists';
    }

    let outcome: BootstrapOutcome;
    try {
      outcome = await this.prisma.$transaction((tx) =>
        this.apply(tx.users, email),
      );
    } catch (error) {
      // Another instance starting at the same time added the same address first.
      if (!isDuplicate(error)) throw error;
      outcome = 'exists';
    }

    if (outcome === 'creator') {
      this.log.warn(
        'SUPER_ADMIN_EMAIL belongs to a creator; no Super Admin was set',
      );
    } else if (outcome === 'promoted' || outcome === 'created') {
      // The address is personal data, so the log names only what happened (OWASP A09).
      this.log.log(`First Super Admin set from SUPER_ADMIN_EMAIL (${outcome})`);
    }
    return outcome;
  }

  private async apply(
    users: BootstrapUsers,
    email: string,
  ): Promise<BootstrapOutcome> {
    // Asked again inside the transaction, for an instance that started at the same moment.
    if ((await users.count({ where: ACTIVE_SUPER_ADMIN })) > 0) {
      return 'exists';
    }

    const user = await users.findUnique({
      where: { email },
      select: { id: true, creators: { select: { id: true } } },
    });
    // OWASP A01: a creator's account never becomes an Admin's through server config.
    if (user?.creators) return 'creator';

    if (user) {
      await users.update({
        where: { id: user.id },
        data: { is_admin: true, admin_role: 'super_admin', is_active: true },
      });
      return 'promoted';
    }

    await users.create({
      data: { email, is_admin: true, admin_role: 'super_admin' },
    });
    return 'created';
  }
}
