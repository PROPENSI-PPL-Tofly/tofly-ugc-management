// Server-side only: what the "Log Aktivitas" page shows. Its API (23.6) does not exist yet, so
// development answers sample rows and every other build fails into the page's error state: made-up
// rows on a deployed app would read as a real record of who did what.

import type { AuditLogLoaded, AuditLogState } from "./audit-log";

export async function loadAuditLog(state: AuditLogState): Promise<AuditLogLoaded> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("The Log Aktivitas API is not available yet");
  }
  const { mockAuditLog } = await import("./audit-log-mock");
  return mockAuditLog(state);
}
