"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  contentPlanAfterTabChange,
  contentPlanHref,
  parseContentPlanParams,
  type ContentPlanCounts,
  type ContentPlanTab,
} from "@/lib/content-plan";
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
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(tab: ContentPlanTab) {
    const state = parseContentPlanParams(Object.fromEntries(searchParams.entries()));
    router.replace(contentPlanHref(contentPlanAfterTabChange(state, tab)), {
      scroll: false,
    });
  }

  return <ContentPlanTabs active={active} counts={counts} onSelect={select} />;
}
