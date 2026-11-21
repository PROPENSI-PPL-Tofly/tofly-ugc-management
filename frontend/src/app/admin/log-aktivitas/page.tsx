import { AuditLogPanel } from "@/components/audit-log/audit-log-panel";
import { AppShell } from "@/components/shell/app-shell";
import { parseAuditLogParams, type AuditLogLoaded } from "@/lib/audit-log";
import { loadAuditLog } from "@/lib/audit-log.server";
import { jakartaDay } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log Aktivitas — Tofly",
};

// "Log Aktivitas" (PBI-23, 23.7). The URL is the only state, so a filtered view can be shared and
// reloaded. Not in the menu yet: the session does not say who is a Super Admin.
export default async function AuditLogPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const state = parseAuditLogParams(await searchParams);

  let loaded: AuditLogLoaded | null;
  try {
    loaded = await loadAuditLog(state);
  } catch {
    // A request that failed is not a log that is empty: this one is offered again.
    loaded = null;
  }

  return (
    <AppShell title="Log Aktivitas">
      <AuditLogPanel
        state={state}
        list={loaded?.list ?? null}
        actors={loaded?.actors ?? []}
        creators={loaded?.creators ?? []}
        today={jakartaDay()}
      />
    </AppShell>
  );
}
