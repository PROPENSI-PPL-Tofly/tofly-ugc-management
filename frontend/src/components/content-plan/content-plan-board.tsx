"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_SORT, type ContentPlanRow, type ContentPlanTab, type DeadlineSort } from "@/lib/content-plan";
import { ContentPlanTable } from "./content-plan-table";

/** The search parameter a notification or a bookmark uses to open one content's panel. */
const CONTENT_PARAM = "content";

/**
 * Puts the open panel's content in the address, so it can be copied, shared or reopened like
 * the link a notification sends. Replaced rather than pushed: Back leaves the page instead of
 * walking through every panel opened on it. Other parameters (the tab, the page) stay.
 */
function rememberContentParam(contentId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(CONTENT_PARAM, contentId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Takes the deep link back out of the address once its panel has closed, so a reload or a
 * Back does not open the panel again. Other parameters (the tab, the page) stay.
 * replaceState keeps Next's router in sync without a navigation or a server round trip.
 */
function forgetContentParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(CONTENT_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

  function closePanel() {
    setOpenContentId(null);
    forgetContentParam();
  }

  /** The deadline header's press: the direction turns over and the old page no longer means anything. */
  function toggleSort() {
    const next = new URLSearchParams(searchParams.toString());
    const flipped = sort === "desc" ? "asc" : "desc";
    if (flipped === DEFAULT_SORT) next.delete("sort");
    else next.set("sort", flipped);
    next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <ContentPlanTable
        items={items}
        filtered={filtered}
        tab={tab}
        sort={sort}
        onSortToggle={toggleSort}
        onOpen={(contentId) => {
          setOpenContentId(contentId);
          rememberContentParam(contentId);
        }}
      />
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
