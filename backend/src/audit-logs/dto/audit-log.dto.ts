// What "Log Aktivitas" answers (PBI-23, SCRUM-296), in the shape the page reads (SCRUM-297,
// frontend/src/lib/audit-log.ts). targetId is added for the subtask's "target ID and label".

import type {
  AuditAction,
  AuditCategory,
  AuditTargetType,
} from '../../audit/audit-actions.js';
import type { AuditActor } from '../../audit/audit-logger.js';

export interface AuditLogRowDto {
  id: string;
  occurredAt: string;
  // As stored when the action happened, never the account as it is now.
  actor: { name: string; role: AuditActor['role'] };
  category: AuditCategory;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  targetLabel: string;
  // Null when the entry concerns no creator, or the creator no longer exists.
  creator: { id: string; name: string } | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  note: string | null;
}

export interface AuditLogListResponse {
  items: AuditLogRowDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FilterOption {
  value: string;
  label: string;
}

// Who the Aktor and Creator filters can offer (SCRUM-297's AuditLogLoaded.actors/.creators).
export interface AuditLogFilterOptions {
  actors: FilterOption[];
  creators: FilterOption[];
}
