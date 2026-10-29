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
 * The tab bar's own client half: a press rewrites the URL with the tab's contract applied —
 * the search and the picks carry over, the status, sort and page of the old tab fall away —
 * so every tab is a linkable, reloadable address like the rest of the page.
 */
export function ContentPlanTabBar({
  active,
  counts,
}: Readonly<{ active: ContentPlanTab; counts: ContentPlanCounts }>) {
  const { replaceQuery } = useUrlQuery();

  // Read from what was last sent, not from the address bar: a filter ticked a moment ago is
  // not in the address yet, and a tab built on the address would drop it.
  function select(tab: ContentPlanTab) {
    const state = parseContentPlanParams(
      Object.fromEntries(new URLSearchParams(latestQuery()).entries()),
    );
    replaceQuery(
      new URLSearchParams(buildContentPlanQuery(contentPlanAfterTabChange(state, tab))).toString(),
    );
  }

  return <ContentPlanTabs active={active} counts={counts} onSelect={select} />;
}
