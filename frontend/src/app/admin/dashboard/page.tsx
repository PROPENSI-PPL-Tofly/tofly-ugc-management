import { KpiCards } from "@/components/executive-dashboard/kpi-cards";
import { PerformaCreatorTable } from "@/components/executive-dashboard/performa-creator-table";
import { RangeHeader } from "@/components/executive-dashboard/range-header";
import { StackedBarChart } from "@/components/executive-dashboard/stacked-bar-chart";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Panel } from "@/components/ui/panel";
import {
  DELIVERY_SEGMENTS,
  RANGE_MONTHS,
  SPENDING_SEGMENTS,
  VIEWS_SEGMENTS,
  dashboardHref,
  deliveryRows,
  parseDashboardParams,
  spendingRows,
  viewsRows,
} from "@/lib/executive-dashboard";
import { fetchExecutiveDashboard, type ExecutiveAnswer } from "@/lib/executive-dashboard.server";
import { toExecutiveKpis } from "@/lib/executive-kpis";
import type { SearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Tofly",
};

/**
 * The executive Dashboard (PBI-24), admin only: the range header and six KPI cards (24.2), then
 * the three monthly charts and Performa Creator (24.3), all from one GET /admin/dashboard (24.1).
 * The address is the whole state (range and the table's order), checked before anything is
 * asked (OWASP A03). A failed load offers a retry of the same view, never charts of zeros, and
 * each KPI card says on its own that it failed.
 */
export default async function ExecutiveDashboardPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const state = parseDashboardParams(await searchParams);

  let dashboard: ExecutiveAnswer | null = null;
  try {
    dashboard = await fetchExecutiveDashboard(state);
  } catch {
    dashboard = null;
  }

  const retryHref = dashboardHref(state);

  return (
    <AppShell role="admin" title="Dashboard">
      <RangeHeader
        period={dashboard?.period ?? null}
        options={RANGE_MONTHS.map((months) => ({ months, href: dashboardHref({ ...state, months }) }))}
        active={state.months}
      />
      <KpiCards kpis={toExecutiveKpis(dashboard?.kpis)} months={state.months} retryHref={retryHref} />
      {dashboard === null ? (
        <Panel>
          <LoadError title="Dashboard tidak bisa dimuat." retryHref={retryHref} />
        </Panel>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <StackedBarChart
              title="Spending per Bulan"
              hint="Setelah penalti dan penyesuaian"
              rows={spendingRows(dashboard.months)}
              segments={SPENDING_SEGMENTS}
              unit="rupiah"
              emptyTitle="Belum ada spending di rentang ini."
            />
            <StackedBarChart
              title="Views per Bulan"
              hint="Link tersinkron atau diisi manual"
              rows={viewsRows(dashboard.months)}
              segments={VIEWS_SEGMENTS}
              unit="count"
              emptyTitle="Belum ada views di rentang ini."
            />
          </div>
          <StackedBarChart
            title="Ketepatan Pengiriman"
            hint="Konten yang jatuh tempo per bulan"
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
