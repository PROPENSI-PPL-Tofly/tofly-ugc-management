import { AppShell } from "@/components/shell/app-shell";
import { CreatorFilters } from "@/components/creators/creator-filters";
import { CreatorTable } from "@/components/creators/creator-table";
import { Pagination } from "@/components/creators/pagination";
import { StatCards } from "@/components/creators/stat-cards";
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
      subtitle="Data terpusat creator untuk pengambilan keputusan operasional"
    >
      <StatCards stats={result.stats} />

      <Panel>
        <PanelHead
          title="Creator Database"
          hint="Kontrak, progress task, dan produktivitas creator — dasar keputusan perpanjangan kontrak dan alokasi task baru."
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
