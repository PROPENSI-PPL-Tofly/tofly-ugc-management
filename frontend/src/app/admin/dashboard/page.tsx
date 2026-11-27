import { PerformaCreatorTable } from "@/components/executive-dashboard/performa-creator-table";
import { StackedBarChart } from "@/components/executive-dashboard/stacked-bar-chart";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Panel } from "@/components/ui/panel";
import {
  DELIVERY_SEGMENTS,
  SPENDING_SEGMENTS,
  VIEWS_SEGMENTS,
  dashboardHref,
  deliveryRows,
  parseDashboardParams,
  spendingRows,
  viewsRows,
  type ExecutiveDashboard,
} from "@/lib/executive-dashboard";
import { fetchExecutiveDashboard } from "@/lib/executive-dashboard.server";
import type { SearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Tofly",
};

/**
 * The executive Dashboard (PBI-24), admin only. This subtask (24.3) draws the three monthly
 * charts and Performa Creator; 24.2 adds the range filter and the six KPI cards above them.
 * The address is the whole state (range and the table's order), checked before anything is
 * asked (OWASP A03). A failed load offers a retry of the same view, never charts of zeros.
 */
export default async function ExecutiveDashboardPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const state = parseDashboardParams(await searchParams);

  let dashboard: ExecutiveDashboard | null = null;
  try {
    dashboard = await fetchExecutiveDashboard(state);
  } catch {
    dashboard = null;
  }

  return (
    <AppShell role="admin" title="Dashboard">
      {dashboard === null ? (
        <Panel>
          <LoadError title="Dashboard tidak bisa dimuat." retryHref={dashboardHref(state)} />
        </Panel>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <StackedBarChart
              title="Spending per Bulan"
              hint="Invoice yang difinalisasi, setelah penalti dan penyesuaian."
              rows={spendingRows(dashboard.months)}
              segments={SPENDING_SEGMENTS}
              unit="rupiah"
              emptyTitle="Belum ada spending di rentang ini."
            />
            <StackedBarChart
              title="Views per Bulan"
              hint="Views dari link yang dikirim di bulan itu."
              rows={viewsRows(dashboard.months)}
              segments={VIEWS_SEGMENTS}
              unit="count"
              emptyTitle="Belum ada views di rentang ini."
            />
          </div>
          <StackedBarChart
            title="Ketepatan Pengiriman"
            hint="Konten yang jatuh tempo di bulan itu."
            rows={deliveryRows(dashboard.months)}
            segments={DELIVERY_SEGMENTS}
            unit="count"
            emptyTitle="Belum ada konten yang jatuh tempo di rentang ini."
          />
          <PerformaCreatorTable creators={dashboard.creators} state={state} />
        </div>
      )}
    </AppShell>
  );
}
