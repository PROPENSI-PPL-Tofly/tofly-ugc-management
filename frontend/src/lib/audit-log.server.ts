// Server-side only: what the "Log Aktivitas" page reads from its API (23.6). Any failure throws, so
// the page can tell a request that failed from a log that is empty.

import { backendGet } from "./backend.server";
import {
  buildAuditLogQuery,
  type AuditLogList,
  type AuditLogLoaded,
  type AuditLogState,
} from "./audit-log";

export type AuditLogFilterOptions = Omit<AuditLogLoaded, "list">;

async function readJson<T>(path: string, what: string): Promise<T> {
  const response = await backendGet(path);
  if (!response.ok) {
    throw new Error(`Loading the ${what} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadAuditLogList(state: AuditLogState): Promise<AuditLogList> {
  const search = new URLSearchParams(buildAuditLogQuery(state)).toString();
  return readJson(search ? `/audit-logs?${search}` : "/audit-logs", "audit log");
}

export async function loadAuditLogFilterOptions(): Promise<AuditLogFilterOptions> {
  return readJson("/audit-logs/filter-options", "audit log filter options");
}
