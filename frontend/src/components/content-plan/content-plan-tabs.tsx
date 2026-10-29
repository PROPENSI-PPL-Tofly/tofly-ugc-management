"use client";

import { StatusTabs } from "@/components/ui/status-tabs";
import { CONTENT_PLAN_TABS, type ContentPlanCounts, type ContentPlanTab } from "@/lib/content-plan";

/** The id of the Content Plan's list region, which its tabs switch. */
export const CONTENT_PLAN_LIST_ID = "content-plan-list";

/**
 * The four tabs of the Content Plan, grouped by whose ball it is. Only Perlu Approval's
 * counter turns red, and only past zero — a red badge on an empty queue would cry wolf.
 */
export function ContentPlanTabs({
  active,
  counts,
  onSelect,
}: Readonly<{
  active: ContentPlanTab;
  counts: ContentPlanCounts;
  onSelect: (tab: ContentPlanTab) => void;
}>) {
  return (
    <StatusTabs
      label="Tab Content Plan"
      panelId={CONTENT_PLAN_LIST_ID}
      tabs={CONTENT_PLAN_TABS}
      active={active}
      counts={counts}
      onSelect={onSelect}
    />
  );
}
