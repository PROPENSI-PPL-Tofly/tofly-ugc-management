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
import { ContentPlanViewToggle } from "@/components/content-plan/content-plan-view-toggle";
import { CALENDAR_MAX_ITEMS, shownMonth } from "@/lib/content-plan-calendar";
import {
  ContentPlanCalendarTooLargeError,
  fetchContentPlan,
  fetchContentPlanCreatorOptions,
  fetchContentPlanMonth,
} from "@/lib/content-plan.server";
import { jakartaDay } from "@/lib/format";

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
  const isCalendar = state.view === "calendar";
  // The calendar's month comes from the address, or is today's in Jakarta (I3.6).
  const today = jakartaDay();
  const month = shownMonth(state.month, today);

  let result: ContentPlanResponse | null = null;
  let creators: ContentPlanCreatorOption[] = [];
  let pastEnd: number | null = null;
  let shownPage = state.page;
  let tooLarge = false;

  // Each fetch fails for itself: a creator-name failure costs the filter's choices, while a
  // list failure costs the page. Promise.all would let either one take down both.
  const [plan, names] = await Promise.allSettled([
    isCalendar ? fetchContentPlanMonth(state, month) : fetchContentPlan(state),
    fetchContentPlanCreatorOptions(),
  ]);
  creators = names.status === "fulfilled" ? names.value : [];

  if (plan.status === "rejected") {
    result = null;
    tooLarge = plan.reason instanceof ContentPlanCalendarTooLargeError;
  } else if (isCalendar) {
    result = plan.value;
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
      action={<ContentPlanViewToggle state={state} />}
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
          <ContentPlanTabBar active={state.tab} counts={result.counts} />
          <ContentPlanFilters state={state} creators={creators} counts={result.counts} />
          <ContentPlanBoard
            items={result.items}
            filtered={isFiltered(state)}
            tab={state.tab}
            sort={state.sort}
            calendar={isCalendar ? { month, today, state } : null}
          />
          {/* The calendar shows its whole month, so it has no pages to turn. */}
          {isCalendar ? null : (
            <Pagination
              basePath={CONTENT_PLAN_BASE}
              noun="konten"
              query={query}
              page={shownPage}
              pageSize={CONTENT_PLAN_PAGE_SIZE}
              total={result.total}
              totalPages={result.totalPages}
            />
          )}
        </Panel>
      ) : tooLarge ? (
        // Refused, not cut short: part of a month drawn as if it were all of it would mislead.
        <LoadError
          title="Kalender tidak bisa dimuat."
          message={`Bulan ini memuat lebih dari ${CALENDAR_MAX_ITEMS.toLocaleString("id-ID")} konten. Persempit dengan filter Creator, Tipe, atau Status, atau gunakan tampilan Tabel.`}
          retryHref={retryHref}
        />
      ) : (
        <LoadError title="Content Plan tidak bisa dimuat." retryHref={retryHref} />
      )}
    </AppShell>
  );
}
