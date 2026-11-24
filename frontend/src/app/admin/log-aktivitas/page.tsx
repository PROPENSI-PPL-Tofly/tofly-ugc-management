import { AuditLogPanel } from "@/components/audit-log/audit-log-panel";
import { AccessDenied } from "@/components/shell/access-denied";
import { AppShell } from "@/components/shell/app-shell";
import { parseAuditLogParams } from "@/lib/audit-log";
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

  // A null list is a request that failed, not a log that is empty: the panel offers it again.
  // Losing only the filter choices leaves the entries on screen.
  const [list, options] = await Promise.all([
    loadAuditLogList(state).catch(() => null),
    loadAuditLogFilterOptions().catch((): AuditLogFilterOptions => ({ actors: [], creators: [] })),
  ]);

  return (
    <AppShell title="Log Aktivitas">
      <AuditLogPanel
        state={state}
        list={list}
        actors={options.actors}
        creators={options.creators}
        today={jakartaDay()}
      />
    </AppShell>
  );
}
