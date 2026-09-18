import { AppShell } from "@/components/shell/app-shell";
import { CreatorTable } from "@/components/creators/creator-table";
import { Pagination } from "@/components/creators/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { fetchCreators, parsePage, type CreatorListResponse } from "@/lib/creators";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Database — Tofly",
};

function LoadFailed() {
  return (
    <div role="alert" className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">Data creator tidak bisa dimuat.</p>
      <p className="mt-1 text-[13px] text-muted">Server tidak menjawab.</p>
      <a
        href="/admin/creators"
        className="mt-4 inline-block rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 active:bg-surface-2"
      >
        Muat ulang
      </a>
    </div>
  );
}

// Fetched on the server so the first paint already has the rows and the backend address
// stays out of the browser. The URL is the only state: the page number comes in as a search
// param, which keeps the view linkable and reload-safe.
export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page, invalid } = parsePage(await searchParams);

  let result: CreatorListResponse | null = null;
  try {
    result = await fetchCreators(page);
  } catch {
    result = null;
  }

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
          title="Semua creator"
          hint="Kontrak, progres konten, dan produktivitas setiap creator. Pakai ini saat memutuskan perpanjangan kontrak atau alokasi konten baru."
        />
        {result ? (
          <>
            <CreatorTable creators={result.items} total={result.total} />
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <LoadFailed />
        )}
      </Panel>
    </AppShell>
  );
}
