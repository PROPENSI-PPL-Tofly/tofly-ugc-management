// "Log Aktivitas" filters as specifications (PBI-23, SCRUM-296). Each filter knows the one rule it
// adds to the audit_logs query, and allOf requires them together, so the same composed rule counts
// the entries and reads the page: total and items can never disagree. A new filter is a new class;
// the service that runs the query does not change.

import type { Prisma } from '@prisma/client';
import type { AuditAction, AuditCategory } from '../audit/audit-actions.js';

export type AuditLogWhere = Prisma.audit_logsWhereInput;

export interface AuditLogSpec {
  toWhere(): AuditLogWhere;
}

// The actor filter's value for the entries no person made ("Sistem"), as SCRUM-297 sends it.
export const SYSTEM_ACTOR_FILTER = 'system';

const DAY_MS = 86_400_000;

// WIB has no daylight saving, so every calendar day starts at 00:00 +07:00.
function startOfJakartaDay(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`);
}

/** From the first day's start to the last day's end in WIB, both days included; either may be open. */
export class OccurredBetween implements AuditLogSpec {
  constructor(
    private readonly from: string | undefined,
    private readonly to: string | undefined,
  ) {}

  toWhere(): AuditLogWhere {
    return {
      occurred_at: {
        ...(this.from && { gte: startOfJakartaDay(this.from) }),
        ...(this.to && {
          lt: new Date(startOfJakartaDay(this.to).getTime() + DAY_MS),
        }),
      },
    };
  }
}

/** The chosen people by user id; "Sistem" is the entries with no user behind them. */
export class ActedBy implements AuditLogSpec {
  constructor(private readonly actors: readonly string[]) {}

  toWhere(): AuditLogWhere {
    const userIds = this.actors.filter(
      (actor) => actor !== SYSTEM_ACTOR_FILTER,
    );
    const either: AuditLogWhere[] = [];
    if (userIds.length > 0) either.push({ actor_user_id: { in: userIds } });
    if (userIds.length < this.actors.length)
      either.push({ actor_user_id: null });
    return { OR: either };
  }
}

export class InCategories implements AuditLogSpec {
  constructor(private readonly categories: readonly AuditCategory[]) {}

  toWhere(): AuditLogWhere {
    return { category: { in: [...this.categories] } };
  }
}

export class WithActions implements AuditLogSpec {
  constructor(private readonly actions: readonly AuditAction[]) {}

  toWhere(): AuditLogWhere {
    return { action: { in: [...this.actions] } };
  }
}

/** The entries about the chosen creators (audit_logs.creator_id). */
export class AboutCreators implements AuditLogSpec {
  constructor(private readonly creatorIds: readonly string[]) {}

  toWhere(): AuditLogWhere {
    return { creator_id: { in: [...this.creatorIds] } };
  }
}

/** Every specification at once; none at all matches every entry. */
export function allOf(specs: readonly AuditLogSpec[]): AuditLogSpec {
  return { toWhere: () => ({ AND: specs.map((spec) => spec.toWhere()) }) };
}
