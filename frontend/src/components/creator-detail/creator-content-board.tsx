"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { AddContentModal } from "@/components/contents/add-content-modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import {
  CREATOR_DETAIL_PAGE_SIZE,
  DEFAULT_CREATOR_DETAIL_PARAMS,
  PERIOD_STATUS_LABELS,
  buildCreatorDetailQuery,
  creatorDetailBase,
  isCreatorDetailFiltered,
  type CreatorDetailParams,
  type CreatorDetailView,
} from "@/lib/creator-detail";
import { useUrlQuery } from "@/lib/url-query";
import { CreatorContentFilters } from "./creator-content-filters";
import { CreatorContentTable } from "./creator-content-table";

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
}: Readonly<{
  creatorId: string;
  view: CreatorDetailView;
  /** The address as the server read it, which the page links are built on. */
  state: CreatorDetailParams;
}>) {
  const router = useRouter();
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { show: confirm, toast } = useToast();
  const { replaceQuery } = useUrlQuery();

  const period = view.selected;

  /** The empty filtered table's way back: every filter goes, the open period stays. */
  function resetFilters() {
    const query = buildCreatorDetailQuery({ ...DEFAULT_CREATOR_DETAIL_PARAMS, contract: state.contract });
    replaceQuery(new URLSearchParams(query).toString());
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
          <h2 className="text-[15px]">Content Plan</h2>
        </div>
        <EmptyState title="Creator ini belum memiliki kontrak." />
      </Panel>
    );
  }


  return (
    <>
      {/* Unclipped: the filter popups hang below the bar and past the panel's foot. */}
      <Panel clip={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px]">Content Plan</h2>
            {/* Which period the table is scoped to, as the prototype's chip says it. */}
            <Pill tone="accent">
              Periode {period.periodNumber} · {PERIOD_STATUS_LABELS[period.status]}
            </Pill>
          </div>

          {/* A period that has ended is only to be read. */}
          {period.status === "expired" ? null : (
            <Button variant="accent" onClick={() => setAdding(true)}>
              + Tambah Konten
            </Button>
          )}
        </div>

        <CreatorContentFilters />

        <CreatorContentTable
          rows={view.rows}
          filtered={isCreatorDetailFiltered(state)}
          onOpen={setOpenContentId}
          onReset={resetFilters}
        />

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
        />
      ) : null}

      {toast}
    </>
  );
}
