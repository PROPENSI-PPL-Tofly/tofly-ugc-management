import { AuditLogPanel } from "@/components/audit-log/audit-log-panel";
import { AccessDenied } from "@/components/shell/access-denied";
import { AppShell } from "@/components/shell/app-shell";
import { auditDatesReversed, parseAuditLogParams } from "@/lib/audit-log";
import {
  loadAuditLogFilterOptions,
  loadAuditLogList,
  type AuditLogFilterOptions,
} from "@/lib/audit-log.server";
import { jakartaDay } from "@/lib/format";
import { homeFor } from "@/lib/session";
import { currentSession } from "@/lib/session.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log Aktivitas — Tofly",
};

// "Log Aktivitas" (PBI-23, 23.7), for Super Admins only. The URL is the only state, so a filtered
// view can be shared and reloaded.
export default async function AuditLogPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await currentSession();
  if (!session?.isSuperAdmin) {
    return (
      <AccessDenied
        reason="Halaman ini hanya untuk Super Admin."
        home={homeFor("admin")}
        homeLabel="Kembali ke Kreator"
      />
    );
  }

  const state = parseAuditLogParams(await searchParams);

  // Not awaited: the choices stream in, so the table never waits for them, and losing them leaves
  // the entries on screen.
  const options = loadAuditLogFilterOptions().catch(
    (): AuditLogFilterOptions => ({ actors: [], creators: [] }),
  );
  // A null list is a request that failed, not a log that is empty: the panel offers it again.
  // A reversed range is not asked for at all: the API refuses it and the panel says why.
  const list = auditDatesReversed(state) ? null : await loadAuditLogList(state).catch(() => null);

  return (
    <AppShell title="Log Aktivitas">
      <AuditLogPanel
        state={state}
        list={list}
        options={options}
        today={jakartaDay()}
      />
    </AppShell>
  );
}
