import { AppShell } from "@/components/shell/app-shell";
import { CreatorFilters } from "@/components/creators/creator-filters";
import { CreatorTable } from "@/components/creators/creator-table";
import { Pagination } from "@/components/creators/pagination";
import { RosterHealth } from "@/components/creators/roster-health";
import { Panel, PanelHead } from "@/components/ui/panel";
import { fetchCreators, parseFilters } from "@/lib/creators";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Database — Tofly",
};

// Fetched on the server so the first paint already has the data, and so the backend address
// stays out of the browser. The URL is the only state: filters and page come in as search
// params, which keeps the view linkable and reload-safe.
export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const result = await fetchCreators(filters);

  return (
    <AppShell
      title="Creator Database"
      subtitle="Semua creator yang bekerja sama dengan Tofly, dalam satu tabel"
    >
      <RosterHealth stats={result.stats} productivity={filters.productivity} />

      <Panel>
        <PanelHead
          title="Semua creator"
          hint="Kontrak, progress konten, dan produktivitas setiap creator. Pakai ini saat memutuskan perpanjangan kontrak atau alokasi konten baru."
        />
        <CreatorFilters filters={filters} shown={result.total} total={result.stats.total} />
        <CreatorTable creators={result.items} />
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
        />
      </Panel>
    </AppShell>
  );
}
