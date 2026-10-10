import { AppShell } from "@/components/shell/app-shell";
import { ContentPlanBoard } from "@/components/content-plan/content-plan-board";
import { ContentPlanFilters } from "@/components/content-plan/content-plan-filters";
import { ContentPlanTabBar } from "@/components/content-plan/content-plan-tab-bar";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import {
  CONTENT_PLAN_BASE,
  CONTENT_PLAN_PAGE_SIZE,
  buildContentPlanQuery,
  contentPlanHref,
  isFiltered,
  parseContentPlanParams,
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

  try {
    const [plan, names] = await Promise.all([
      fetchContentPlan(state),
      fetchContentPlanCreatorOptions(),
    ]);
    result = plan;
    creators = names;

    // A page past the end (an old link, or a plan that shrank as content was decided) shows
    // the first page instead of an empty table that would claim there is nothing to plan.
    if (plan.total > 0 && state.page > plan.totalPages) {
      pastEnd = state.page;
      shownPage = 1;
      result = await fetchContentPlan({ ...state, page: 1 });
    }
  } catch {
    result = null;
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
        <Panel>
          <ContentPlanTabBar active={state.tab} counts={result.counts} />
          <ContentPlanFilters state={state} creators={creators} />
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
