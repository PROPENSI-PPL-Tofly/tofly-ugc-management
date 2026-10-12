"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_SORT, type ContentPlanRow, type ContentPlanTab, type DeadlineSort } from "@/lib/content-plan";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { ContentPlanTable } from "./content-plan-table";
import { CONTENT_PLAN_LIST_ID } from "./content-plan-tabs";

/** The search parameter a notification or a bookmark uses to open one content's panel. */
const CONTENT_PARAM = "content";

/**
 * The Content Plan's interactive part: the table plus the detail panel its Tinjau and Detail
 * buttons open. The page fetches on the server and cannot hold "which content is open", so this
 * client component does. A decision refreshes the plan, which re-fetches the rows and the tab
 * counters with the decided content in its new status.
 */
export function ContentPlanBoard({
  items,
  filtered,
  tab,
  sort,
}: Readonly<{
  items: readonly ContentPlanRow[];
  filtered: boolean;
  tab: ContentPlanTab;
  sort: DeadlineSort;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { replaceQuery, replaceQuietly } = useUrlQuery();
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const { show: confirm, toast } = useToast();

  // A notification (or a bookmarked link) opens the panel straight from the URL; read on
  // the client because the search string only carries the real address after hydration.
  // One read on mount, then the URL is never consulted again — this is the effect doing
  // exactly what the rule asks of an effect (syncing with an external system), not a
  // cascading render.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(CONTENT_PARAM);
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL read on mount
      setOpenContentId(id);
    }
  }, []);

  // The address names the open panel's content for as long as the panel is open, so it can be
  // copied, shared or reopened like the link a notification sends. It replaces the entry
  // rather than adding one: Back leaves the page instead of walking through every panel
  // opened on it. Written here and not in the press that opens the panel: a filter change
  // already on its way then lands as an address without ?content=, and the link has to come
  // back then too.
  //
  // It is built on what was last sent, so a filter ticked a moment ago is kept, and checked
  // against it too: once the link has been sent there is nothing more to write, however many
  // times this runs before the address shows it.
  const linked = searchParams.get(CONTENT_PARAM);
  useEffect(() => {
    if (!openContentId) return;

    const next = new URLSearchParams(latestQuery());
    if (next.get(CONTENT_PARAM) === openContentId) return;

    next.set(CONTENT_PARAM, openContentId);
    replaceQuietly(next.toString());
  }, [openContentId, linked, replaceQuietly]);

  /** Closing takes the link back out, so a reload or a Back does not open the panel again. */
  function closePanel() {
    setOpenContentId(null);

    const next = new URLSearchParams(latestQuery());
    next.delete(CONTENT_PARAM);
    replaceQuietly(next.toString());
  }

  /**
   * The deadline header's press: the direction turns over and the old page no longer means
   * anything. Both the rest of the query and the direction come from what was last sent, so
   * the press keeps a filter ticked a moment ago and a second quick press turns back.
   */
  function toggleSort() {
    const next = new URLSearchParams(latestQuery());
    const flipped = next.get("sort") === "asc" ? "desc" : "asc";
    if (flipped === DEFAULT_SORT) next.delete("sort");
    else next.set("sort", flipped);
    next.delete("page");
    replaceQuery(next.toString());
  }

  return (
    <>
      {/* The region the tabs switch, named by the tabs' aria-controls. */}
      <div id={CONTENT_PLAN_LIST_ID} role="tabpanel" aria-label="Daftar konten">
        <ContentPlanTable
          items={items}
          filtered={filtered}
          tab={tab}
          sort={sort}
          onSortToggle={toggleSort}
          onOpen={setOpenContentId}
        />
      </div>
      {openContentId ? (
        // Keyed by content so switching rows remounts the panel rather than leaving the
        // previous item on screen while the next loads. A decision refreshes the plan
        // and closes the panel, so the decided row lands on its new tab.
        <ContentDetailPanel
          key={openContentId}
          contentId={openContentId}
          role="admin"
          onClose={closePanel}
          onDecided={(decision) => {
            closePanel();
            confirm(DECISION_CONFIRMATIONS[decision]);
            router.refresh();
          }}
        />
      ) : null}
      {toast}
    </>
  );
}
