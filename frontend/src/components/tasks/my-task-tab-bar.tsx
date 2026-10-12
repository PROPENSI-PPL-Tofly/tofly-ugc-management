"use client";

import { StatusTabs } from "@/components/ui/status-tabs";
import {
  MY_TASK_TABS,
  buildMyTasksQuery,
  myTasksAfterTabChange,
  parseMyTasksParams,
  type MyTasksCounts,
  type MyTaskTab,
} from "@/lib/my-tasks";
import { parseTaskView, taskViewParams } from "@/lib/task-view";
import { latestQuery, useUrlQuery } from "@/lib/url-query";

/** The id of Task Saya's list region, which its tabs switch. */
export const MY_TASK_LIST_ID = "my-task-list";

/**
 * Task Saya's tabs, grouped by whose turn it is. A press rewrites the URL with the tab's
 * contract applied — the search and the filters carry over, the status picks, sort and page of
 * the old tab fall away — so every tab is a linkable, reloadable address like the rest of the
 * page. The view is not the tab's to change: a tab pressed above the calendar keeps it open.
 */
export function MyTaskTabBar({
  active,
  counts,
}: Readonly<{ active: MyTaskTab; counts: MyTasksCounts }>) {
  const { replaceQuery } = useUrlQuery();

  // Read from what was last sent, not from the address bar: a filter ticked a moment ago is
  // not in the address yet, and a tab built on the address would drop it.
  function select(tab: MyTaskTab) {
    const sent = Object.fromEntries(new URLSearchParams(latestQuery()).entries());
    const next = myTasksAfterTabChange(parseMyTasksParams(sent), tab);
    replaceQuery(
      new URLSearchParams({
        ...buildMyTasksQuery(next),
        ...taskViewParams(parseTaskView(sent)),
      }).toString(),
    );
  }

  return (
    <StatusTabs
      label="Tab Task Saya"
      panelId={MY_TASK_LIST_ID}
      tabs={MY_TASK_TABS}
      active={active}
      counts={counts}
      onSelect={select}
    />
  );
}
