import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS, type AuditAction } from './audit-actions.js';

export interface AuditActor {
  // Null only for "Sistem".
  userId: string | null;
  name: string;
  role: 'super_admin' | 'admin' | 'creator' | 'system';
}

export const SYSTEM_ACTOR: AuditActor = {
  userId: null,
  name: 'Sistem',
  role: 'system',
};

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  target: { id?: string; label: string };
  creatorId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  note?: string;
}

// The slice of a Prisma transaction the logger needs, so a test stubs exactly that (DIP).
export interface AuditWriter {
  audit_logs: {
    create(args: {
      data: Prisma.audit_logsUncheckedCreateInput;
    }): Promise<unknown>;
  };
}

// Who an action's user is, read on the action's own transaction.
export interface AuditActorReader {
  users: {
    findUnique(args: {
      where: { id: string };
      select: { name: true; email: true; admin_role: true };
    }): Promise<{
      name: string | null;
      email: string;
      admin_role: 'admin' | 'super_admin' | null;
    } | null>;
  };
}

// AC 19 (OWASP A09:2025): tokens, sign-in codes and their hashes, passwords, credentials, session
// ids and file contents never reach the log.
const FORBIDDEN_KEY =
  /token|secret|password|file_?content|base64|code$|code_?hash|api_?key|authorization|cookie|session_?id|(^|_)otp$/i;

function safeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return undefined;
  if (Array.isArray(value)) {
    return value.map(safeValue).filter((item) => item !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    const kept = Object.entries(value)
      .filter(([key]) => !FORBIDDEN_KEY.test(key))
      .map(([key, item]) => [key, safeValue(item)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(kept);
  }
  return value;
}

function safeValues(
  values: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  return values && (safeValue(values) as Prisma.InputJsonValue);
}

// Writes on the transaction of the action it records, so the two land or fail together.
@Injectable()
export class AuditLogger {
  // The person as they are now, by name or else email; "Sistem" when no user is behind the action.
  async actorOf(
    tx: AuditActorReader,
    userId: string | null | undefined,
  ): Promise<AuditActor> {
    if (!userId) return SYSTEM_ACTOR;

    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { name: true, email: true, admin_role: true },
    });
    // A person acted, so the entry keeps pointing at them and never reads as "Sistem".
    if (!user) return { userId, name: 'Admin', role: 'admin' };

    return {
      userId,
      name: user.name ?? user.email,
      role: user.admin_role ?? 'creator',
    };
  }

  // The entry of an action by this user, read and written on the action's own transaction.
  async recordBy(
    tx: AuditWriter & AuditActorReader,
    userId: string | null | undefined,
    entry: Omit<AuditEntry, 'actor'>,
  ): Promise<void> {
    await this.record(tx, { ...entry, actor: await this.actorOf(tx, userId) });
  }

  async record(tx: AuditWriter, entry: AuditEntry): Promise<void> {
    const { category, targetType } = AUDIT_ACTIONS[entry.action];

    await tx.audit_logs.create({
      data: {
        actor_user_id: entry.actor.userId,
        actor_name: entry.actor.name,
        actor_role: entry.actor.role,
        category,
        action: entry.action,
        target_type: targetType,
        target_id: entry.target.id ?? null,
        target_label: entry.target.label,
        creator_id: entry.creatorId ?? null,
        old_values: safeValues(entry.oldValues),
        new_values: safeValues(entry.newValues),
        note: entry.note ?? null,
      },
    });
  }
}
