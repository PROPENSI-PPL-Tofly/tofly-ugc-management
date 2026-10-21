"use client";

import { StatusTabs } from "@/components/ui/status-tabs";
import { CONTENT_PLAN_TABS, type ContentPlanCounts, type ContentPlanTab } from "@/lib/content-plan";
import {
  buildCreatorDetailQuery,
  creatorDetailAfterTabChange,
  parseCreatorDetailParams,
} from "@/lib/creator-detail";
import { latestQuery, useUrlQuery } from "@/lib/url-query";

/** The id of the period's list region, which its tabs switch. */
export const CREATOR_CONTENT_LIST_ID = "creator-content-list";

/**
 * The open period's content by whose ball it is, the Content Plan's four tabs on one creator. A
 * press rewrites the address with the tab's contract applied: the period, the search and the
 * picks carry over, the status, order and page of the old tab fall away.
 */
export function CreatorContentTabBar({
  active,
  counts,
}: Readonly<{ active: ContentPlanTab; counts: ContentPlanCounts }>) {
  const { replaceQuery } = useUrlQuery();

  // Read from what was last sent, not from the address bar: a filter ticked a moment ago is
  // not in the address yet, and a tab built on the address would drop it.
  function select(tab: ContentPlanTab) {
    const state = parseCreatorDetailParams(
      Object.fromEntries(new URLSearchParams(latestQuery()).entries()),
    );
    replaceQuery(
      new URLSearchParams(buildCreatorDetailQuery(creatorDetailAfterTabChange(state, tab))).toString(),
    );
  }

  return (
    <StatusTabs
      label="Tab konten periode"
      panelId={CREATOR_CONTENT_LIST_ID}
      tabs={CONTENT_PLAN_TABS}
      active={active}
      counts={counts}
      onSelect={select}
    />
  );
}
