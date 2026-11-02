"use client";

import {
  buildContentPlanQuery,
  contentPlanAfterTabChange,
  parseContentPlanParams,
  type ContentPlanCounts,
  type ContentPlanTab,
} from "@/lib/content-plan";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { ContentPlanTabs } from "./content-plan-tabs";

/**
 * Switches the Content Plan's tab: rewrites the URL with the tab's contract applied — the search
 * and the picks carry over, the status, sort and page of the old tab fall away — so every tab is
 * a linkable, reloadable address. Shared by the row of tabs and the phone's Tampilkan choice,
 * so both make the very same move.
 */
export function useContentPlanTabSelect(): (tab: ContentPlanTab) => void {
  const { replaceQuery } = useUrlQuery();

  // Read from what was last sent, not from the address bar: a filter ticked a moment ago is
  // not in the address yet, and a tab built on the address would drop it.
  return function select(tab: ContentPlanTab) {
    const state = parseContentPlanParams(
      Object.fromEntries(new URLSearchParams(latestQuery()).entries()),
    );
    replaceQuery(
      new URLSearchParams(buildContentPlanQuery(contentPlanAfterTabChange(state, tab))).toString(),
    );
  };
}

/** The tab bar's own client half (a row from sm up; a choice in the filters below). */
export function ContentPlanTabBar({
  active,
  counts,
}: Readonly<{ active: ContentPlanTab; counts: ContentPlanCounts }>) {
  const select = useContentPlanTabSelect();

  return <ContentPlanTabs active={active} counts={counts} onSelect={select} />;
}
