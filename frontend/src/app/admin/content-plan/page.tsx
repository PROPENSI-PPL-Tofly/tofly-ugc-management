import { AppShell } from "@/components/shell/app-shell";
import { ContentPlanBoard } from "@/components/content-plan/content-plan-board";
import { ContentPlanFilters } from "@/components/content-plan/content-plan-filters";
import { ContentPlanTabBar } from "@/components/content-plan/content-plan-tab-bar";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelBand } from "@/components/ui/panel";
import {
  CONTENT_PLAN_BASE,
  CONTENT_PLAN_PAGE_SIZE,
  buildContentPlanQuery,
  contentPlanHref,
  isFiltered,
  parseContentPlanParams,
  tabDef,
  type ContentPlanCreatorOption,
  type ContentPlanResponse,
} from "@/lib/content-plan";
import {
  fetchContentPlan,
  fetchContentPlanCreatorOptions,
} from "@/lib/content-plan.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Content Plan — Tofly",
};

/**
 * The Content Plan: every creator's content in one table, grouped by whose ball it is. The
 * URL is the whole state — tab, search, filters, page — so a view can be linked, bookmarked
 * and reloaded. The list arrives from the 5.1 endpoint; until it answers, the page offers a
 * retry rather than a table it cannot fill.
 */
export default async function ContentPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseContentPlanParams(await searchParams);

  let result: ContentPlanResponse | null = null;
  let creators: ContentPlanCreatorOption[] = [];
  let pastEnd: number | null = null;
  let shownPage = state.page;

  // Each fetch fails for itself: a creator-name failure costs the filter's choices, while a
  // list failure costs the page. Promise.all would let either one take down both.
  const [plan, names] = await Promise.allSettled([
    fetchContentPlan(state),
    fetchContentPlanCreatorOptions(),
  ]);
  creators = names.status === "fulfilled" ? names.value : [];

  if (plan.status === "rejected") {
    result = null;
  } else {
    result = plan.value;

    // A page past the end (an old link, or a plan that shrank as content was decided) shows
    // the first page instead of an empty table that would claim there is nothing to plan.
    if (plan.value.total > 0 && state.page > plan.value.totalPages) {
      pastEnd = state.page;
      shownPage = 1;

      try {
        result = await fetchContentPlan({ ...state, page: 1 });
      } catch {
        result = null;
      }
    }
  }

  const query = buildContentPlanQuery({ ...state, page: 1 });
  const retryHref = contentPlanHref(state);

  return (
    <AppShell
      title="Content Plan"
      subtitle="Semua konten semua creator, menurut deadline dan siapa yang pegang bola"
    >
      {pastEnd !== null ? (
        <p
          role="status"
          className="mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          Halaman {pastEnd} tidak ada, menampilkan halaman pertama.
        </p>
      ) : null}

      {result ? (
        // Unclipped: the filter popups hang below the bar and past the panel's foot.
        <Panel clip={false}>
          <PanelBand
            title="Konten"
            tone="ink"
            icon="calendar"
            count={result.total}
            noun="konten"
            aside={tabDef(state.tab).label}
          />
          <ContentPlanTabBar active={state.tab} counts={result.counts} />
          <ContentPlanFilters state={state} creators={creators} counts={result.counts} />
          <ContentPlanBoard
            items={result.items}
            filtered={isFiltered(state)}
            tab={state.tab}
            sort={state.sort}
          />
          <Pagination
            basePath={CONTENT_PLAN_BASE}
            noun="konten"
            query={query}
            page={shownPage}
            pageSize={CONTENT_PLAN_PAGE_SIZE}
            total={result.total}
            totalPages={result.totalPages}
          />
        </Panel>
      ) : (
        <LoadError title="Content Plan tidak bisa dimuat." retryHref={retryHref} />
      )}
    </AppShell>
  );
}
