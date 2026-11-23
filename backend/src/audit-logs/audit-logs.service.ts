import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuditAction,
  AuditCategory,
  AuditTargetType,
} from '../audit/audit-actions.js';
import { safeValue, type AuditActor } from '../audit/audit-logger.js';
import { joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuditLogQuery } from './audit-log-query.js';
import { SYSTEM_ACTOR_FILTER } from './audit-log-specs.js';
import type {
  AuditLogFilterOptions,
  AuditLogListResponse,
  AuditLogRowDto,
  FilterOption,
} from './dto/audit-log.dto.js';

// PBI-23 AC 17: rows a page, set here and never by the request.
export const AUDIT_LOG_PAGE_SIZE = 20;

// Newest first; the id keeps entries of the same moment in one order across pages.
const NEWEST_FIRST: Prisma.audit_logsOrderByWithRelationInput[] = [
  { occurred_at: 'desc' },
  { id: 'desc' },
];

const ROW_SELECT = {
  id: true,
  occurred_at: true,
  actor_name: true,
  actor_role: true,
  category: true,
  action: true,
  target_type: true,
  target_id: true,
  target_label: true,
  creator_id: true,
  old_values: true,
  new_values: true,
  note: true,
} satisfies Prisma.audit_logsSelect;

const CREATOR_NAME_SELECT = {
  id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
} satisfies Prisma.creatorsSelect;

type StoredRow = Prisma.audit_logsGetPayload<{ select: typeof ROW_SELECT }>;

// Only an object of fields is shown, and SCRUM-295's filter runs again on the way out, so an entry
// written past AuditLogger still never shows a credential (AC 19, OWASP A09:2025, A10:2025).
function shownValues(stored: Prisma.JsonValue): Record<string, unknown> | null {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return null;
  }
  return safeValue(stored) as Record<string, unknown>;
}

// The slice of Prisma this service reads, so a test stubs exactly that (DIP). No users: the actor
// shown is the one stored with the entry.
export type AuditLogsClient = Pick<PrismaService, 'audit_logs' | 'creators'>;

function toRow(row: StoredRow, creators: Map<string, string>): AuditLogRowDto {
  const creatorName = row.creator_id && creators.get(row.creator_id);
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    // The database allows only these roles and categories (audit_logs checks); AuditLogger writes
    // only SCRUM-295's actions and targets.
    actor: { name: row.actor_name, role: row.actor_role as AuditActor['role'] },
    category: row.category as AuditCategory,
    action: row.action as AuditAction,
    targetType: row.target_type as AuditTargetType,
    targetId: row.target_id,
    targetLabel: row.target_label,
    creator: creatorName ? { id: row.creator_id!, name: creatorName } : null,
    oldValues: shownValues(row.old_values),
    newValues: shownValues(row.new_values),
    note: row.note,
  };
}

function byLabel(a: FilterOption, b: FilterOption): number {
  return a.label.localeCompare(b.label, 'id');
}

const SISTEM_OPTION: FilterOption = {
  value: SYSTEM_ACTOR_FILTER,
  label: 'Sistem',
};

/** "Log Aktivitas" (PBI-23, SCRUM-296): reads what SCRUM-295's AuditLogger wrote, never more. */
@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: AuditLogsClient,
  ) {}

  async list({ page, filter }: AuditLogQuery): Promise<AuditLogListResponse> {
    const where = filter.toWhere();
    const total = await this.prisma.audit_logs.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
    // A page past the end reads as the last one, so the offset never outgrows the entries.
    const shown = Math.min(page, totalPages);

    const rows = await this.prisma.audit_logs.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (shown - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
      select: ROW_SELECT,
    });
    const creators = await this.creatorNames(rows.map((row) => row.creator_id));

    return {
      items: rows.map((row) => toRow(row, creators)),
      page: shown,
      pageSize: AUDIT_LOG_PAGE_SIZE,
      total,
      totalPages,
    };
  }

  /**
   * Who the filters can offer, from the log itself: an Admin since deactivated still has entries to
   * find. Each person is named as they last acted, as their entries are; "Sistem" always comes last.
   */
  async filterOptions(): Promise<AuditLogFilterOptions> {
    const [actorNames, creatorIds] = await Promise.all([
      this.prisma.audit_logs.groupBy({
        by: ['actor_user_id', 'actor_name'],
        where: { actor_user_id: { not: null } },
        _max: { occurred_at: true },
      }),
      this.prisma.audit_logs.groupBy({
        by: ['creator_id'],
        where: { creator_id: { not: null } },
      }),
    ]);

    const latest = new Map<string, { label: string; at: number }>();
    for (const { actor_user_id, actor_name, _max } of actorNames) {
      const at = _max.occurred_at?.getTime() ?? 0;
      const known = latest.get(actor_user_id!);
      if (!known || at > known.at) {
        latest.set(actor_user_id!, { label: actor_name, at });
      }
    }
    const actors = [...latest].map(([value, { label }]) => ({ value, label }));

    const names = await this.creatorNames(
      creatorIds.map(({ creator_id }) => creator_id),
    );
    const creators = [...names].map(([value, label]) => ({ value, label }));

    return {
      actors: [...actors.sort(byLabel), SISTEM_OPTION],
      creators: creators.sort(byLabel),
    };
  }

  // Each creator's name as it is now; a creator who no longer exists is simply absent.
  private async creatorNames(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();

    const creators = await this.prisma.creators.findMany({
      where: { id: { in: wanted } },
      select: CREATOR_NAME_SELECT,
    });
    return new Map(creators.map((creator) => [creator.id, joinName(creator)]));
  }
}
