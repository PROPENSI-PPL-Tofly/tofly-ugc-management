// "Pengguna Admin" (PBI-23, SCRUM-246): who can sign in as an Admin. Every change is written with
// its "Log Aktivitas" entry on one transaction, so access never changes without a trace (OWASP
// A09:2025). Accounts are never deleted, so names on finalized invoices stay.

import {
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
import type { AdminRole } from '../auth/google/ports.js';
import type { Paging } from '../creators/paging.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminRename, NewAdmin } from './admin-user-input.js';
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
  findUnique(args: object): Promise<unknown>;
  create(args: object): Promise<AdminUserRow>;
  update(args: object): Promise<AdminUserRow>;
}

export type AdminUsersTransaction = { users: AdminUsersTable } & AuditWriter &
  AuditActorReader & {
    $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  };

export interface AdminUsersClient {
  users: AdminUsersTable;
  $transaction<T>(work: (tx: AdminUsersTransaction) => Promise<T>): Promise<T>;
}

const ADMINS = { is_admin: true } as const;

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
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : ADMINS;
    const [rows, total, activeCount, inactiveCount] = await Promise.all([
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
      this.prisma.users.count({ where }),
      this.prisma.users.count({ where: { ...ADMINS, is_active: true } }),
      this.prisma.users.count({ where: { ...ADMINS, is_active: false } }),
    ]);
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
  async create(input: NewAdmin, actorId: string): Promise<AdminUserDto> {
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

  /** "Ubah Admin": the name. The email never changes; a new address is a new Admin. */
  async rename(
    id: string,
    { name }: AdminRename,
    actorId: string,
  ): Promise<AdminUserDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAdmin(tx, id);
      if (target.name === name) return target;
      const renamed = await tx.users.update({
        where: { id },
        data: { name },
        select: ADMIN_USER_SELECT,
      });
      await this.record(tx, actorId, 'admin_changed', renamed, {
        oldValues: { name: target.name },
        newValues: { name },
      });
      return renamed;
    });
    return adminUserDto(row, actorId);
  }

  /** A deactivated Admin can sign in again with the same email (AC: never hard-deleted). */
  async reactivate(id: string, actorId: string): Promise<AdminUserDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAdmin(tx, id);
      if (target.is_active) return target;
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
