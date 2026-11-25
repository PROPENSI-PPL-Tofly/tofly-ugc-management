// "Pengguna Admin" (PBI-23, SCRUM-246): who can sign in as an Admin. Every change is written with
// its "Log Aktivitas" entry on one transaction, so access never changes without a trace (OWASP
// A09:2025). Accounts are never deleted, so names on finalized invoices stay.

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditAction } from '../audit/audit-actions.js';
import {
  AuditLogger,
  type AuditActorReader,
  type AuditWriter,
} from '../audit/audit-logger.js';
import { forbidden } from '../auth/admin.guard.js';
import type { AdminRole } from '../auth/google/ports.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminChange, NewAdmin } from './admin-user-input.js';
import type {
  AdminUserDto,
  AdminUserListResponse,
} from './dto/admin-user.dto.js';

export const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  admin_role: true,
  is_active: true,
  last_signed_in_at: true,
  created_at: true,
} as const;

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  admin_role: AdminRole | null;
  is_active: boolean;
  last_signed_in_at: Date | null;
  created_at: Date;
}

type TargetRow = AdminUserRow & { is_admin: boolean };

/** The slice of the users table this service reads and writes (DIP: a test stubs exactly this). */
export interface AdminUsersTable {
  findMany(args: object): Promise<AdminUserRow[]>;
  count(args: object): Promise<number>;
  groupBy(args: object): Promise<{ is_active: boolean; _count: { _all: number } }[]>;
  findUnique(args: object): Promise<unknown>;
  create(args: object): Promise<AdminUserRow>;
  update(args: object): Promise<AdminUserRow>;
}

export type AdminUsersTransaction = { users: AdminUsersTable } & AuditWriter &
  AuditActorReader & {
    app_sessions: { deleteMany(args: { where: { userId: string } }): Promise<unknown> };
    $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  };

export interface AdminUsersClient {
  users: AdminUsersTable;
  $transaction<T>(work: (tx: AdminUsersTransaction) => Promise<T>): Promise<T>;
}

const ADMINS = { is_admin: true } as const;

/** Prisma hands "contains" to ILIKE unescaped; a typed _, % or backslash means only itself. */
export function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

export function adminNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'ADMIN_NOT_FOUND',
    message: 'Admin tidak ditemukan',
  });
}

function emailTaken(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data admin tidak valid',
    errors: { email: 'Email sudah dipakai' },
  });
}

/**
 * A role change, making someone Super Admin, a deactivation and bringing a Super Admin back wait
 * for the email code (AC).
 */
function confirmationRequired(): ForbiddenException {
  return new ForbiddenException({
    code: 'CONFIRMATION_REQUIRED',
    message: 'Konfirmasi dengan kode yang dikirim ke email kamu dulu.',
  });
}

function invalidRole(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data admin tidak valid',
    errors: { role: message },
  });
}

const OWN_ROLE = 'Kamu tidak bisa mengubah role akunmu sendiri.';
const LAST_SUPER_ADMIN = 'Minimal harus ada satu Super Admin';

function isDuplicate(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/** How an Admin is named in "Log Aktivitas": by name, else by email. */
export function adminLabelOf(row: Pick<AdminUserRow, 'name' | 'email'>): string {
  return row.name ?? row.email;
}

export function adminUserDto(row: AdminUserRow, actorId: string): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    // Every Admin has a role (users_admin_role_matches_is_admin), and only Admins are read here.
    role: row.admin_role!,
    status: row.is_active ? 'active' : 'inactive',
    lastSignedInAt: row.last_signed_in_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    isSelf: row.id === actorId,
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: AdminUsersClient,
    @Optional()
    @Inject(AuditLogger)
    private readonly audit: AuditLogger = new AuditLogger(),
  ) {}

  async list(
    { page, pageSize }: Paging,
    q: string | undefined,
    actorId: string,
  ): Promise<AdminUserListResponse> {
    const where = q
      ? {
          ...ADMINS,
          OR: [
            { name: { contains: likeLiteral(q), mode: 'insensitive' } },
            { email: { contains: likeLiteral(q), mode: 'insensitive' } },
          ],
        }
      : ADMINS;
    const [rows, groups, searched] = await Promise.all([
      this.prisma.users.findMany({
        where,
        // Active first, then by name; an Admin with no name yet sorts by email after the named ones.
        orderBy: [
          { is_active: 'desc' },
          { name: { sort: 'asc', nulls: 'last' } },
          { email: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ADMIN_USER_SELECT,
      }),
      // The header's two numbers from one snapshot, in one query instead of two.
      this.prisma.users.groupBy({
        by: ['is_active'],
        where: ADMINS,
        _count: { _all: true },
      }),
      q ? this.prisma.users.count({ where }) : undefined,
    ]);
    const countOf = (active: boolean) =>
      groups.find((group) => group.is_active === active)?._count._all ?? 0;
    const activeCount = countOf(true);
    const inactiveCount = countOf(false);
    // With no search the page lists the whole team, which the two groups already count.
    const total = searched ?? activeCount + inactiveCount;
    return {
      items: rows.map((row) => adminUserDto(row, actorId)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      activeCount,
      inactiveCount,
    };
  }

  /** "Tambah Admin": the new Admin can sign in at once, with Google or an email code (PBI-39). */
  async create(
    input: NewAdmin,
    actorId: string,
    confirmed = false,
  ): Promise<AdminUserDto> {
    // Adding a Super Admin is making someone Super Admin, so it waits for the code too.
    if (input.role === 'super_admin' && !confirmed) throw confirmationRequired();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Any user's email, a creator's or a deactivated Admin's too: one address, one account.
        if (
          await tx.users.findUnique({
            where: { email: input.email },
            select: { id: true },
          })
        ) {
          throw emailTaken();
        }
        const created = await tx.users.create({
          data: {
            name: input.name,
            email: input.email,
            is_admin: true,
            admin_role: input.role,
            is_active: true,
          },
          select: ADMIN_USER_SELECT,
        });
        await this.record(tx, actorId, 'admin_added', created, {
          newValues: { name: input.name, email: input.email, role: input.role },
        });
        return created;
      });
      return adminUserDto(row, actorId);
    } catch (error) {
      // Another request added the same address between the check and the insert.
      if (isDuplicate(error)) throw emailTaken();
      throw error;
    }
  }

  /**
   * "Ubah Admin": the name, and the role. The email never changes; a new address is a new Admin.
   * A role change needs this session's email-code confirmation, never applies to the Super Admin's
   * own role, never leaves no active Super Admin, and ends the Admin's sessions so the new role
   * applies on their next sign-in (OWASP A01:2025).
   */
  async update(
    id: string,
    change: AdminChange,
    actorId: string,
    confirmed: boolean,
  ): Promise<AdminUserDto> {
    // The actor passed SuperAdminGuard, so any other role for themselves is a change.
    if (id === actorId && change.role !== undefined && change.role !== 'super_admin') {
      throw invalidRole(OWN_ROLE);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const supers =
        change.role === undefined ? [] : await this.lockSuperAdmins(tx, id);
      const target =
        change.role === undefined
          ? await this.lockAdmin(tx, id)
          : await this.readAdmin(tx, id);
      const renames = target.name !== change.name;
      const role = change.role ?? target.admin_role!;
      const changesRole = role !== target.admin_role;
      if (!renames && !changesRole) return target;

      if (changesRole) {
        if (!confirmed) throw confirmationRequired();
        if (this.isLastActiveSuperAdmin(target, supers)) {
          throw invalidRole(LAST_SUPER_ADMIN);
        }
        this.refuseUnlessStillSuperAdmin(actorId, supers);
      }
      const updated = await tx.users.update({
        where: { id },
        data: changesRole ? { name: change.name, admin_role: role } : { name: change.name },
        select: ADMIN_USER_SELECT,
      });
      if (changesRole) await tx.app_sessions.deleteMany({ where: { userId: id } });
      await this.record(tx, actorId, 'admin_changed', updated, {
        oldValues: {
          ...(renames && { name: target.name }),
          ...(changesRole && { role: target.admin_role }),
        },
        newValues: {
          ...(renames && { name: change.name }),
          ...(changesRole && { role }),
        },
      });
      return updated;
    });
    return adminUserDto(row, actorId);
  }

  /**
   * "Nonaktifkan": after the email code, ends the Admin's sessions at once and blocks sign-in. Never
   * the Super Admin themselves, and never the last active Super Admin (OWASP A01:2025).
   */
  async deactivate(
    id: string,
    actorId: string,
    confirmed: boolean,
  ): Promise<AdminUserDto> {
    if (id === actorId) {
      throw new ConflictException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'Kamu tidak bisa mengubah status akunmu sendiri.',
      });
    }
    if (!confirmed) throw confirmationRequired();
    const row = await this.prisma.$transaction(async (tx) => {
      const supers = await this.lockSuperAdmins(tx, id);
      const target = await this.readAdmin(tx, id);
      if (!target.is_active) return target;
      if (this.isLastActiveSuperAdmin(target, supers)) {
        throw new ConflictException({
          code: 'LAST_SUPER_ADMIN',
          message: LAST_SUPER_ADMIN,
        });
      }
      this.refuseUnlessStillSuperAdmin(actorId, supers);
      const deactivated = await tx.users.update({
        where: { id },
        data: { is_active: false },
        select: ADMIN_USER_SELECT,
      });
      await tx.app_sessions.deleteMany({ where: { userId: id } });
      await this.record(tx, actorId, 'admin_deactivated', deactivated, {
        oldValues: { status: 'active' },
        newValues: { status: 'inactive' },
      });
      return deactivated;
    });
    return adminUserDto(row, actorId);
  }

  /**
   * A deactivated Admin can sign in again with the same email (AC: never hard-deleted). A Super
   * Admin's access comes back only after the email code, as taking it away needed one.
   */
  async reactivate(
    id: string,
    actorId: string,
    confirmed: boolean,
  ): Promise<AdminUserDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAdmin(tx, id);
      if (target.is_active) return target;
      if (target.admin_role === 'super_admin' && !confirmed) {
        throw confirmationRequired();
      }
      const reactivated = await tx.users.update({
        where: { id },
        data: { is_active: true },
        select: ADMIN_USER_SELECT,
      });
      await this.record(tx, actorId, 'admin_reactivated', reactivated, {
        oldValues: { status: 'inactive' },
        newValues: { status: 'active' },
      });
      return reactivated;
    });
    return adminUserDto(row, actorId);
  }

  /**
   * The Admin's row, locked until the transaction ends, so two changes at once each record the
   * values the other left (OWASP A09:2025). A creator's id reads as no Admin at all.
   */
  protected async lockAdmin(
    tx: AdminUsersTransaction,
    id: string,
  ): Promise<TargetRow> {
    await tx.$queryRaw`select id from users where id = ${id}::uuid for update`;
    return this.readAdmin(tx, id);
  }

  /**
   * Locks every active Super Admin and the target, in id order, before anything is read, so two
   * Super Admins demoting or deactivating each other wait for one another instead of both seeing
   * a second Super Admin, and cannot deadlock. Answers the active Super Admins as the lock found
   * them.
   */
  protected async lockSuperAdmins(
    tx: AdminUsersTransaction,
    id: string,
  ): Promise<string[]> {
    const rows = (await tx.$queryRaw`
      select id, (admin_role = 'super_admin' and is_active) as active_super
      from users
      where (admin_role = 'super_admin' and is_active) or id = ${id}::uuid
      order by id for update`) as { id: string; active_super: boolean }[];
    return rows.filter((row) => row.active_super).map((row) => row.id);
  }

  /**
   * SuperAdminGuard read the actor's role when the request came in. Another Super Admin may have
   * demoted or deactivated them while this request waited for the lock, so the rows the lock found
   * decide (OWASP A01:2025).
   */
  protected refuseUnlessStillSuperAdmin(actorId: string, supers: string[]): void {
    if (!supers.includes(actorId)) {
      throw forbidden('Halaman ini hanya untuk Super Admin');
    }
  }

  /** Whether taking this Admin's Super Admin access away would leave no active Super Admin. */
  protected isLastActiveSuperAdmin(target: TargetRow, supers: string[]): boolean {
    return (
      target.admin_role === 'super_admin' &&
      target.is_active &&
      !supers.some((superId) => superId !== target.id)
    );
  }

  protected async readAdmin(
    tx: AdminUsersTransaction,
    id: string,
  ): Promise<TargetRow> {
    const target = (await tx.users.findUnique({
      where: { id },
      select: { ...ADMIN_USER_SELECT, is_admin: true },
    })) as TargetRow | null;
    if (!target?.is_admin) throw adminNotFound();
    return target;
  }

  protected async record(
    tx: AdminUsersTransaction,
    actorId: string,
    action: AuditAction,
    target: AdminUserRow,
    values: {
      oldValues?: Record<string, unknown>;
      newValues?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.recordBy(tx, actorId, {
      action,
      target: { id: target.id, label: adminLabelOf(target) },
      ...values,
    });
  }
}
