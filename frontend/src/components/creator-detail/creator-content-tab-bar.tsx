"use client";

import { StatusTabs } from "@/components/ui/status-tabs";
import { CONTENT_PLAN_TABS, type ContentPlanCounts, type ContentPlanTab } from "@/lib/content-plan";
import {
  buildCreatorDetailQuery,
  creatorDetailAfterTabChange,
  parseCreatorDetailParams,
} from "@/lib/creator-detail";
import { latestQuery, useUrlQuery } from "@/lib/url-query";

export const CREATOR_CONTENT_LIST_ID = "creator-content-list";

/** Reuses Content Plan's four status tabs and counter behavior for one creator's contract. */
export function CreatorContentTabBar({
  active,
  counts,
}: Readonly<{ active: ContentPlanTab; counts: ContentPlanCounts }>) {
  const { replaceQuery } = useUrlQuery();

  function select(tab: ContentPlanTab) {
    const state = parseCreatorDetailParams(
      Object.fromEntries(new URLSearchParams(latestQuery()).entries()),
    );
    const query = buildCreatorDetailQuery(creatorDetailAfterTabChange(state, tab));
    replaceQuery(new URLSearchParams(query).toString());
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
