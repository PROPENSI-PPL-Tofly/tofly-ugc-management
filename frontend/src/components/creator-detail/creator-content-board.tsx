"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { AddContentModal } from "@/components/contents/add-content-modal";
import { useVideoLinksModal } from "@/components/my-task/use-video-links-modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import {
  CREATOR_DETAIL_PAGE_SIZE,
  DEFAULT_CREATOR_DETAIL_PARAMS,
  buildCreatorDetailQuery,
  creatorDetailBase,
  isCreatorDetailFiltered,
  type CreatorDetailParams,
  type CreatorDetailView,
} from "@/lib/creator-detail";
import { useUrlQuery } from "@/lib/url-query";
import { jakartaDay } from "@/lib/format";
import { CreatorContentFilters } from "./creator-content-filters";
import { CreatorContentTable } from "./creator-content-table";
import { CREATOR_CONTENT_LIST_ID, CreatorContentTabBar } from "./creator-content-tab-bar";
import { CreatorCalendar } from "./creator-calendar";
import { PeriodBadge } from "./period-badge";

/**
 * The open period's Content Plan: its filters, its table and the detail panel a row opens. The
 * page fetches on the server and cannot hold "which content is open", so this client component
 * does. A decision or a new content refreshes the page, which re-fetches the rows and the
 * period's terms.
 *
 * The pagination sits once below the table and steps aside when everything fits on one page,
 * as it does on Content Plan and Task Saya.
 */
export function CreatorContentBoard({
  creatorId,
  view,
  state,
  today,
}: Readonly<{
  creatorId: string;
  view: CreatorDetailView;
  /** The address as the server read it, which the page links are built on. */
  state: CreatorDetailParams;
  today?: string;
}>) {
  const router = useRouter();
  const { openLinks, linksModal } = useVideoLinksModal("admin");
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { show: confirm, toast } = useToast();
  const { replaceQuery } = useUrlQuery();

  const period = view.selected;

  /** The empty filtered table's way back: every filter goes, the open period stays. */
  function resetFilters() {
    const query = buildCreatorDetailQuery({ ...DEFAULT_CREATOR_DETAIL_PARAMS, contract: state.contract, tab: state.tab });
    replaceQuery(new URLSearchParams(query).toString());
  }

  function toggleSort() {
    const next = { ...state, sort: state.sort === "asc" ? "desc" as const : "asc" as const, page: 1 };
    replaceQuery(new URLSearchParams(buildCreatorDetailQuery(next)).toString());
  }

  /** What the list shows has changed: say so, and read it again. */
  function confirmAndRefresh(message: string) {
    confirm(message);
    router.refresh();
  }

  if (!period) {
    return (
      <Panel>
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-[15px]">Jadwal Konten</h2>
        </div>
        <EmptyState title="Creator ini belum memiliki kontrak." />
      </Panel>
    );
  }


  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px]">Jadwal Konten</h2>
            {/* Which period the calendar is scoped to, worded as on every period panel. */}
            <PeriodBadge period={period} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Beside Tambah Konten, the action that fills the slots it counts. */}
            {period.remainingEvergreenQuota > 0 ? (
              <p
                role="note"
                className="rounded-(--radius-control) border border-amber bg-amber-wash px-3 py-1.5 text-xs text-amber-ink"
              >
                {period.remainingEvergreenQuota} slot Evergreen belum dialokasikan.
              </p>
            ) : null}
            {/* A period that has ended is only to be read. */}
            {period.status === "expired" ? null : (
              <Button variant="accent" onClick={() => setAdding(true)}>
                + Tambah Konten
              </Button>
            )}
          </div>
        </div>

        <CreatorCalendar
          key={period.contractId}
          entries={view.calendar}
          period={period}
          state={state}
          today={today ?? jakartaDay()}
          onOpen={setOpenContentId}
        />
      </Panel>

      {/* The list is a titled panel of its own under the calendar, so the legend, the tabs, the
          filters and the table header are not four strips stacked on one another. Unclipped: the
          filter popups hang below the bar and past the panel's foot. */}
      <Panel clip={false}>
        {/* Titled as the Jadwal Konten panel above it: the name, then the period badge. */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-1 pt-5">
          <h2 className="text-[15px]">Daftar Konten</h2>
          <PeriodBadge period={period} />
        </div>
        <CreatorContentTabBar active={state.tab} counts={view.counts} />
        <CreatorContentFilters tab={state.tab} />

        <div id={CREATOR_CONTENT_LIST_ID} role="tabpanel" aria-label="Konten kreator">
          <CreatorContentTable
            rows={view.rows}
            filtered={isCreatorDetailFiltered(state)}
            tab={state.tab}
            sort={state.sort}
            onSortToggle={toggleSort}
            onOpen={setOpenContentId}
            onReset={resetFilters}
          />
        </div>

        <Pagination
          basePath={creatorDetailBase(creatorId)}
          noun="konten"
          // The filters and the period, without the page: each link names its own.
          query={buildCreatorDetailQuery({ ...state, page: 1 })}
          page={view.page}
          pageSize={CREATOR_DETAIL_PAGE_SIZE}
          total={view.total}
          totalPages={view.totalPages}
        />
      </Panel>

      {adding ? (
        <AddContentModal
          contractId={period.contractId}
          evergreenCount={period.evergreenCount}
          quota={period.contentQuota}
          contractStart={period.startDate}
          contractEnd={period.endDate}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            confirmAndRefresh("Konten berhasil ditambahkan.");
          }}
        />
      ) : null}

      {openContentId ? (
        // Keyed by content so switching rows remounts the panel rather than leaving the
        // previous item on screen while the next loads.
        <ContentDetailPanel
          key={openContentId}
          contentId={openContentId}
          role="admin"
          onClose={() => setOpenContentId(null)}
          onDecided={(decision) => {
            setOpenContentId(null);
            confirmAndRefresh(DECISION_CONFIRMATIONS[decision]);
          }}
          ports={{
            onManageLinks: (detail) => {
              setOpenContentId(null);
              openLinks(detail);
            },
          }}
        />
      ) : null}

      {linksModal}
      {toast}
    </>
  );
}
