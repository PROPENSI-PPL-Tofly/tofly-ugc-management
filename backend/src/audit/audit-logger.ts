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

// AC 19 (OWASP A09:2025): tokens, sign-in codes, passwords and file contents never reach the log.
const FORBIDDEN_KEY =
  /token|secret|password|file_?content|base64|code$|(^|_)otp$/i;

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
