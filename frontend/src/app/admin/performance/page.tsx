import { PerformanceBoard } from "@/components/performance/performance-board";
import { PerformanceFilters } from "@/components/performance/performance-filters";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelBand } from "@/components/ui/panel";
import {
  PERFORMANCE_LINKS_BASE,
  buildPerformanceLinksQuery,
  parsePerformanceLinksParams,
  type PerformanceLinksPage,
} from "@/lib/performance-links";
import { fetchPerformanceLinks } from "@/lib/performance-links.server";
import { fetchContentPlanCreatorOptions } from "@/lib/content-plan.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Performa Konten — Tofly",
};

/**
 * "Performa Konten": every submitted link with its numbers and data state (PBI-27, AC 22-26),
 * admin only. The URL is the whole state — filters and page — so a view can be linked,
 * bookmarked and reloaded. Until the list answers, the page offers a retry rather than a
 * table it cannot fill.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parsePerformanceLinksParams(await searchParams);

  // Each fetch fails for itself: a name failure costs the filter's choices, while a list
  // failure costs the page. Promise.all would let either one take down both.
  const [links, names] = await Promise.allSettled([
    fetchPerformanceLinks(state),
    fetchContentPlanCreatorOptions(),
  ]);
  const creators = names.status === "fulfilled" ? names.value : [];

  const result: PerformanceLinksPage | null = links.status === "fulfilled" ? links.value : null;
  const query = buildPerformanceLinksQuery(state);

  return (
    <AppShell role="admin" title="Performa Konten">
      {result === null ? (
        <>
          <PerformanceFilters creators={creators} />
          <LoadError
            title="Performa Konten tidak bisa dimuat."
            retryHref={
              new URLSearchParams(query).toString()
                ? `${PERFORMANCE_LINKS_BASE}?${new URLSearchParams(query)}`
                : PERFORMANCE_LINKS_BASE
            }
          />
        </>
      ) : (
        // One panel, banded like the admin's other lists; unclipped, so the filter popups and the
        // state tips hang past its edge. The pagination sits once, below the rows.
        <Panel clip={false}>
          <PanelBand title="Link Konten" tone="ink" icon="chart" count={result.total} noun="link" />
          <PerformanceFilters creators={creators} />
          {result.items.length === 0 ? (
            <p className="px-5 py-14 text-center text-[13px] text-muted">
              Belum ada link yang dikirim
            </p>
          ) : (
            <PerformanceBoard rows={result.items} />
          )}
          <Pagination
            basePath={PERFORMANCE_LINKS_BASE}
            noun="link"
            query={query}
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            totalPages={result.totalPages}
          />
        </Panel>
      )}
    </AppShell>
  );
}
