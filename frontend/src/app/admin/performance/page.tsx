import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import {
  parsePerformanceLinksParams,
  performanceLinksHref,
  type PerformanceLinksPage,
} from "@/lib/performance-links";
import { fetchPerformanceLinks } from "@/lib/performance-links.server";

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

  let result: PerformanceLinksPage | null = null;
  try {
    result = await fetchPerformanceLinks(state);
  } catch {
    result = null;
  }

  return (
    <AppShell role="admin" title="Performa Konten" subtitle="Angka performa setiap link">
      {result === null ? (
        <LoadError
          title="Performa Konten tidak bisa dimuat."
          retryHref={performanceLinksHref(state)}
        />
      ) : result.items.length === 0 ? (
        <p className="px-5 py-14 text-center text-[13px] text-muted">
          Belum ada link yang dikirim
        </p>
      ) : null}
    </AppShell>
  );
}
