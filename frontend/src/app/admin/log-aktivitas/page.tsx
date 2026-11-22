import { AuditLogPanel } from "@/components/audit-log/audit-log-panel";
import { AccessDenied } from "@/components/shell/access-denied";
import { AppShell } from "@/components/shell/app-shell";
import { parseAuditLogParams, type AuditLogLoaded } from "@/lib/audit-log";
import { loadAuditLog } from "@/lib/audit-log.server";
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
