import { AppShell } from "@/components/shell/app-shell";
import { AddCreatorTrigger } from "@/components/creators/add-creator-trigger";
import { CreatorFilters } from "@/components/creators/creator-filters";
import { CreatorTable } from "@/components/creators/creator-table";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { creatorDatabaseQuery } from "@/lib/creator-detail";
import {
  hasActiveFilters,
  parseFilters,
  parsePage,
  type CreatorListResponse,
} from "@/lib/creators";
import { fetchCreators } from "@/lib/creators.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Database — Tofly",
};

// Fetched on the server so the first paint already has the rows and the backend address
// stays out of the browser. The URL is the only state: the page number and filters come
// in as search params, which keeps the view linkable and reload-safe.
export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { page, invalid } = parsePage(params);
  const filters = parseFilters(params);

  let result: CreatorListResponse | null = null;
  try {
    result = await fetchCreators(page, filters);
  } catch {
    result = null;
  }

  const filtered = hasActiveFilters(filters);
  // The view without its page, for the page links; with it, for a retry and the way back.
  const query = creatorDatabaseQuery(filters, 1);
  const returnTo = new URLSearchParams(creatorDatabaseQuery(filters, page)).toString();
  const retryHref = returnTo ? `/admin/creators?${returnTo}` : "/admin/creators";
  // Best-effort duplicate check: only whatever creators this page/filter view already
  // loaded, not the full roster (see AddCreatorModal's own `existingEmails` prop for why).
  const existingEmails = result ? result.items.map((c) => c.email) : [];

  return (
    <AppShell
      title="Creator Database"
      subtitle="Semua creator yang bekerja sama dengan Tofly, dalam satu tabel"
    >
      {invalid !== null ? (
        // Rendered as text: whatever was typed into the URL is shown back, never interpreted.
        <p
          role="status"
          className="mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          Halaman “{invalid}” tidak dikenal, menampilkan halaman pertama.
        </p>
      ) : null}

      <Panel>
        <PanelHead
          title={filtered ? "Hasil pencarian" : "Semua creator"}
          hint="Kontrak, progres konten, dan produktivitas setiap creator. Pakai ini saat memutuskan perpanjangan kontrak atau alokasi konten baru."
          action={<AddCreatorTrigger existingEmails={existingEmails} />}
        />
        <CreatorFilters />
        {result ? (
          <>
            <CreatorTable
              creators={result.items}
              total={result.total}
              filtered={filtered}
              returnTo={returnTo}
            />
            <Pagination
              basePath="/admin/creators"
              noun="creator"
              query={query}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <LoadError title="Data creator tidak bisa dimuat." retryHref={retryHref} />
        )}
      </Panel>
    </AppShell>
  );
}
