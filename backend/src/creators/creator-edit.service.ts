import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type social_platform } from '@prisma/client';
import { invoiceState } from '../invoices/invoice-lifecycle.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CONNECTION_COLUMNS } from '../social/social-connection.js';
import {
  CREATOR_EDIT_AUDIT,
  CREATOR_EDIT_NOTIFIER,
  type CreatorEditAudit,
  type CreatorEditNotifier,
} from './creator-edit-ports.js';
import {
  assertActivePeriod,
  assertUsernameEditable,
  contractEndProblem,
  quotaProblem,
  usernameLock,
} from './creator-edit-policy.js';
import {
  invalidEdit,
  type CreatorEdit,
  type NameColumns,
  type TermsEdit,
} from './creator-edit.js';
import { joinName } from './evergreen.js';
import {
  SOCIAL_PLATFORMS,
  USERNAME_FIELDS,
  type NewCreatorErrors,
} from './new-creator.js';
import { submittedPlatforms } from './submitted-platforms.js';

/** The creator with everything an edit is compared with and judged against. */
const EDITED_CREATOR = {
  user_id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
  users: { select: { email: true, is_admin: true } },
  social_accounts: {
    select: { platform: true, username: true, ...CONNECTION_COLUMNS },
  },
  contracts: {
    orderBy: { start_date: 'asc' },
    select: {
      id: true,
      start_date: true,
      end_date: true,
      original_end_date: true,
      contract_type: true,
      content_quota: true,
      fixed_rate: true,
      invoice: { select: { status: true } },
      _count: { select: { contents: { where: { type: 'evergreen' } } } },
    },
  },
} satisfies Prisma.creatorsSelect;

type EditedCreator = Prisma.creatorsGetPayload<{
  select: typeof EDITED_CREATOR;
}>;
type EditedPeriod = EditedCreator['contracts'][number];

type EditTransaction = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | 'app_sessions'
  | 'content_links'
  | 'contracts'
  | 'creators'
  | 'invoice_rate_changes'
  | 'invoices'
  | 'login_codes'
  | 'social_accounts'
  | 'users'
>;

/** The slice of the database client an edit touches; tests hand in a stub of just that. */
export interface CreatorEditClient {
  $transaction<T>(work: (tx: EditTransaction) => Promise<T>): Promise<T>;
}

/** What the edit saved: the fields that changed, under the form's names. */
export interface EditedCreatorResult {
  id: string;
  changed: string[];
}

/** What the edit endpoint needs, so the controller can inject or stub it by contract. */
export interface CreatorEditor {
  edit(
    creatorId: string,
    edit: CreatorEdit,
    now: Date,
    adminUserId?: string,
  ): Promise<EditedCreatorResult>;
}

interface UsernameChange {
  platform: social_platform;
  /** Null when there was none, or when it is cleared. */
  from: string | null;
  to: string | null;
}

/** Only what differs from the stored creator, so a value sent back unchanged is never an edit. */
interface IdentityChanges {
  name?: NameColumns;
  email?: string;
  usernames: UsernameChange[];
}

interface PeriodChanges {
  period: EditedPeriod;
  /** From 1 in the order the periods start. */
  number: number;
  terms: TermsEdit;
}

type Values = Record<string, unknown>;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function identityChanges(
  creator: EditedCreator,
  edit: CreatorEdit,
): IdentityChanges {
  const usernames = SOCIAL_PLATFORMS.flatMap((platform): UsernameChange[] => {
    const typed = edit.usernames[platform];
    if (typed === undefined) return [];
    const from =
      creator.social_accounts.find((account) => account.platform === platform)
        ?.username ?? null;
    const to = typed === '' ? null : typed;
    return from === to ? [] : [{ platform, from, to }];
  });

  return {
    ...(edit.name &&
      joinName(edit.name) !== joinName(creator) && { name: edit.name }),
    // users.email is citext: another case is the same address.
    ...(edit.email !== undefined &&
      edit.email.toLowerCase() !== creator.users.email.toLowerCase() && {
        email: edit.email,
      }),
    usernames,
  };
}

function periodChanges(
  creator: EditedCreator,
  edit: CreatorEdit,
): PeriodChanges | null {
  if (edit.contractId === undefined) return null;
  const index = creator.contracts.findIndex(({ id }) => id === edit.contractId);
  // Another creator's contract is a 404 like a missing one, so an id never says whose it is.
  if (index === -1) {
    throw new NotFoundException({
      code: 'PERIOD_NOT_FOUND',
      message: 'Periode tidak ditemukan',
    });
  }
  const period = creator.contracts[index];
  const { contractType, fixedRate, contractEnd, quota } = edit.terms;

  return {
    period,
    number: index + 1,
    terms: {
      ...(contractType !== undefined &&
        contractType !== period.contract_type && { contractType }),
      ...(fixedRate !== undefined &&
        !period.fixed_rate.equals(fixedRate) && { fixedRate }),
      ...(contractEnd &&
        contractEnd.getTime() !== period.end_date.getTime() && { contractEnd }),
      ...(quota !== undefined && quota !== period.content_quota && { quota }),
    },
  };
}

/** Each changed identity field as it was and as it is now, under the form's names. */
function identityValues(
  creator: EditedCreator,
  changes: IdentityChanges,
): [Values, Values] {
  const before: Values = {};
  const after: Values = {};
  if (changes.name) {
    before.name = joinName(creator);
    after.name = joinName(changes.name);
  }
  if (changes.email !== undefined) {
    before.email = creator.users.email;
    after.email = changes.email;
  }
  for (const { platform, from, to } of changes.usernames) {
    before[USERNAME_FIELDS[platform]] = from;
    after[USERNAME_FIELDS[platform]] = to;
  }
  return [before, after];
}

/** Each changed term as it was and as it is now, under the form's names. */
function termValues({ period, terms }: PeriodChanges): [Values, Values] {
  const stored: Record<keyof TermsEdit, unknown> = {
    contractType: period.contract_type,
    fixedRate: period.fixed_rate.toNumber(),
    contractEnd: isoDay(period.end_date),
    quota: period.content_quota,
  };
  const before = Object.fromEntries(
    Object.keys(terms).map((field) => [
      field,
      stored[field as keyof TermsEdit],
    ]),
  );
  return [
    before,
    {
      ...terms,
      ...(terms.contractEnd && { contractEnd: isoDay(terms.contractEnd) }),
    },
  ];
}

/** Refuses a period's changes that its state or its neighbours do not allow. */
function assertTermsAllowed(
  { period, terms }: PeriodChanges,
  periods: readonly EditedPeriod[],
  now: Date,
): void {
  if (terms.fixedRate !== undefined) {
    // A contract nobody has touched the invoice of has no row yet; it is running.
    invoiceState(period.invoice?.status ?? 'running').assertCanChangeRate();
  }
  if (terms.contractEnd !== undefined || terms.quota !== undefined) {
    assertActivePeriod(period, now);
  }

  const errors: NewCreatorErrors = {};
  const endProblem =
    terms.contractEnd && contractEndProblem(terms.contractEnd, period, periods);
  if (endProblem) errors.contractEnd = endProblem;
  const shortQuota =
    terms.quota === undefined
      ? undefined
      : quotaProblem(terms.quota, period._count.contents);
  if (shortQuota) errors.quota = shortQuota;
  if (Object.keys(errors).length > 0) throw invalidEdit(errors);
}

// users.email is the only unique column of users this update can collide on.
function isEmailTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * "Ubah Data" (PBI-16): one transaction that locks the creator and every contract of theirs,
 * reads them, refuses what the policy does not allow, then writes and records only what changed.
 * Emails leave once it is saved. The invoice and progress are derived from these columns on
 * read, so nothing is recalculated here.
 */
@Injectable()
export class CreatorEditService implements CreatorEditor {
  constructor(
    @Inject(PrismaService) private readonly prisma: CreatorEditClient,
    @Inject(CREATOR_EDIT_AUDIT) private readonly audit: CreatorEditAudit,
    @Inject(CREATOR_EDIT_NOTIFIER)
    private readonly notifier: CreatorEditNotifier,
  ) {}

  async edit(
    creatorId: string,
    edit: CreatorEdit,
    now: Date,
    adminUserId?: string,
  ): Promise<EditedCreatorResult> {
    const { changed, period } = await this.prisma.$transaction(async (tx) => {
      const creator = await this.lockAndRead(tx, creatorId);
      const identity = identityChanges(creator, edit);
      const contract = periodChanges(creator, edit);

      // Every rule is asked before the first write.
      await this.assertIdentityAllowed(tx, creatorId, creator, identity);
      if (contract) assertTermsAllowed(contract, creator.contracts, now);

      await this.saveIdentity(tx, creatorId, creator, identity, now);
      if (contract) await this.saveTerms(tx, contract, now, adminUserId);

      const label = joinName(identity.name ?? creator);
      const [oldIdentity, newIdentity] = identityValues(creator, identity);
      const [oldTerms, newTerms] = contract ? termValues(contract) : [{}, {}];
      const identityFields = Object.keys(newIdentity);
      const termFields = Object.keys(newTerms);

      if (identityFields.length > 0) {
        await this.audit.recordBy(tx, adminUserId, {
          action: 'creator_changed',
          target: { id: creatorId, label },
          creatorId,
          oldValues: oldIdentity,
          newValues: newIdentity,
        });
      }
      if (contract && termFields.length > 0) {
        await this.audit.recordBy(tx, adminUserId, {
          action: 'period_changed',
          target: {
            id: contract.period.id,
            label: `${label} · Periode ${contract.number}`,
          },
          creatorId,
          oldValues: oldTerms,
          newValues: newTerms,
        });
      }
      return { changed: [...identityFields, ...termFields], period: contract };
    });

    if (period) await this.notify(creatorId, period);
    return { id: creatorId, changed };
  }

  /** Locks before reading, in one order, so no edit, Finalize, hand-in or early end interleaves. */
  private async lockAndRead(
    tx: EditTransaction,
    creatorId: string,
  ): Promise<EditedCreator> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM creators WHERE id = ${creatorId}::uuid FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM contracts WHERE creator_id = ${creatorId}::uuid ORDER BY id FOR UPDATE`,
    );
    const creator = await tx.creators.findUnique({
      where: { id: creatorId },
      select: EDITED_CREATOR,
    });
    if (!creator) {
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'Creator tidak ditemukan',
      });
    }
    return creator;
  }

  private async assertIdentityAllowed(
    tx: EditTransaction,
    creatorId: string,
    creator: EditedCreator,
    { email, usernames }: IdentityChanges,
  ): Promise<void> {
    if (email !== undefined && creator.users.is_admin) {
      throw invalidEdit({
        email: 'Email akun Admin tidak bisa diubah dari sini',
      });
    }
    if (usernames.length === 0) return;

    const submitted = await submittedPlatforms(tx, creatorId);
    for (const { platform } of usernames) {
      const account = creator.social_accounts.find(
        (row) => row.platform === platform,
      );
      assertUsernameEditable(
        usernameLock(account, submitted.has(platform)),
        platform,
      );
    }
  }

  private async saveIdentity(
    tx: EditTransaction,
    creatorId: string,
    creator: EditedCreator,
    { name, email, usernames }: IdentityChanges,
    now: Date,
  ): Promise<void> {
    if (name) {
      await tx.creators.update({
        where: { id: creatorId },
        data: { ...name, updated_at: now },
      });
    }
    if (email !== undefined) await this.saveEmail(tx, creator, email, now);
    for (const change of usernames)
      await this.saveUsername(tx, creatorId, change, now);
  }

  /** The address is the whitelist: from here on only the new one signs in (OWASP A07). */
  private async saveEmail(
    tx: EditTransaction,
    creator: EditedCreator,
    email: string,
    now: Date,
  ): Promise<void> {
    await tx.users
      .update({
        where: { id: creator.user_id },
        data: { email, updated_at: now },
      })
      .catch((error: unknown) => {
        throw isEmailTaken(error)
          ? invalidEdit({ email: 'Email sudah dipakai' })
          : error;
      });
    await tx.app_sessions.deleteMany({ where: { userId: creator.user_id } });
    await tx.login_codes.deleteMany({
      where: {
        email: { in: [creator.users.email.toLowerCase(), email.toLowerCase()] },
      },
    });
  }

  /**
   * Each write repeats the connection rule: connecting does not wait for these locks, and an
   * account connected since the read keeps the platform's own username.
   */
  private async saveUsername(
    tx: EditTransaction,
    creatorId: string,
    { platform, from, to }: UsernameChange,
    now: Date,
  ): Promise<void> {
    const unconnected = {
      creator_id: creatorId,
      platform,
      NOT: { is_connected: true, platform_user_id: { not: null } },
    };
    let written: { count: number };
    if (to === null) {
      written = await tx.social_accounts.deleteMany({ where: unconnected });
    } else if (from === null) {
      written = await tx.social_accounts.createMany({
        data: [{ creator_id: creatorId, platform, username: to }],
        skipDuplicates: true,
      });
    } else {
      written = await tx.social_accounts.updateMany({
        where: unconnected,
        data: { username: to, updated_at: now },
      });
    }
    if (written.count === 0) assertUsernameEditable('connected', platform);
  }

  private async saveTerms(
    tx: EditTransaction,
    { period, terms }: PeriodChanges,
    now: Date,
    adminUserId: string | undefined,
  ): Promise<void> {
    if (Object.keys(terms).length === 0) return;
    const { contractType, fixedRate, contractEnd, quota } = terms;

    await tx.contracts.update({
      where: { id: period.id },
      // Prisma leaves an undefined column as it is.
      data: {
        contract_type: contractType,
        fixed_rate: fixedRate,
        end_date: contractEnd,
        content_quota: quota,
        updated_at: now,
      },
    });
    if (fixedRate === undefined) return;

    // The history hangs on the invoice, which may have no row yet.
    const invoice = await tx.invoices.upsert({
      where: { contract_id: period.id },
      create: { contract_id: period.id },
      update: {},
      select: { id: true },
    });
    await tx.invoice_rate_changes.create({
      data: {
        invoice_id: invoice.id,
        old_rate: period.fixed_rate.toNumber(),
        new_rate: fixedRate,
        actor_user_id: adminUserId ?? null,
        created_at: now,
      },
    });
  }

  private async notify(
    creatorId: string,
    { period, terms }: PeriodChanges,
  ): Promise<void> {
    if (terms.contractEnd) {
      await this.notifier.contractEndChanged({
        creatorId,
        contractId: period.id,
        endDate: isoDay(terms.contractEnd),
      });
    }
    if (terms.quota !== undefined) {
      await this.notifier.quotaChanged({
        creatorId,
        contractId: period.id,
        quota: terms.quota,
      });
    }
  }
}
