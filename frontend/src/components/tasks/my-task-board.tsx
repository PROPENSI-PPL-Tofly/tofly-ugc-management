"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ContentDetailPanel } from "@/components/content-detail/content-detail-panel";
import { DeadlineSortButton } from "@/components/content-plan/deadline-sort";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import type { DeadlineSort } from "@/lib/content-plan";
import {
  DEFAULT_MY_TASKS_SORT,
  MY_TASKS_EMPTY,
  MY_TASKS_FILTERED_EMPTY,
  type MyTask,
  type MyTaskTab,
} from "@/lib/my-tasks";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { MY_TASK_LIST_ID } from "./my-task-tab-bar";
import { MyTaskTable } from "./my-task-table";
import { TaskCalendar } from "./task-calendar";

/** The search parameter a notification or a bookmark uses to open one content's panel. */
const CONTENT_PARAM = "content";

/**
 * Task Saya's interactive part: the table, or the month calendar, the Content Detail panel a row
 * opens, and the deadline sort. The page fetches on the server and cannot hold "which task is
 * open", so this client component does. A draft or a link is handed in from inside that panel,
 * which confirms it, refreshes the page behind it and shows the content's new status.
 */
export function MyTaskBoard({
  tasks,
  tab,
  sort,
  filtered,
  calendarToday,
  calendarOpensOn = null,
}: Readonly<{
  tasks: MyTask[];
  tab: MyTaskTab;
  sort: DeadlineSort;
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered: boolean;
  /** Today in Jakarta, "YYYY-MM-DD": given, the tasks are shown as a month, not as the table. */
  calendarToday?: string;
  /** The day of the deadline range whose month the calendar opens on; null for today's. */
  calendarOpensOn?: string | null;
}>) {
  const searchParams = useSearchParams();
  const { replaceQuery, replaceQuietly } = useUrlQuery();
  // The content whose detail panel is open; keyed by content so a ?content= link can
  // deep-link into it the way a notification would.
  const [detailContentId, setDetailContentId] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);

  // A notification (or a bookmarked link) opens the panel straight from the URL; read on
  // the client because the search string only carries the real address after hydration.
  // One read on mount, then the URL is never consulted again — this is the effect doing
  // exactly what the rule asks of an effect (syncing with an external system), not a
  // cascading render.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(CONTENT_PARAM);
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL read on mount
      setDetailContentId(id);
    }
  }, []);

  // The address names the open panel's content for as long as the panel is open, so it can be
  // copied, shared or reopened like the link a notification sends. It replaces the entry
  // rather than adding one: Back leaves the page instead of walking through every panel
  // opened on it. Written here and not in the press that opens the panel: a filter change
  // already on its way then lands as an address without ?content=, and the link has to come
  // back then too. It builds on what was last sent, so a filter ticked a moment ago is kept.
  const linked = searchParams.get(CONTENT_PARAM);
  useEffect(() => {
    if (!detailContentId) return;

    const next = new URLSearchParams(latestQuery());
    if (next.get(CONTENT_PARAM) === detailContentId) return;

    next.set(CONTENT_PARAM, detailContentId);
    replaceQuietly(next.toString());
  }, [detailContentId, linked, replaceQuietly]);

  /** Closing takes the link back out, so a reload or a Back does not open the panel again. */
  function closeDetail() {
    setDetailContentId(null);

    const next = new URLSearchParams(latestQuery());
    next.delete(CONTENT_PARAM);
    replaceQuietly(next.toString());
  }

  /**
   * The deadline order turns over and the old page no longer means anything. Both the rest of
   * the query and the direction come from what was last sent, so the press keeps a filter
   * ticked a moment ago and a second quick press turns back.
   */
  function toggleSort() {
    const next = new URLSearchParams(latestQuery());
    const flipped = next.get("sort") === "desc" ? "asc" : "desc";
    if (flipped === DEFAULT_MY_TASKS_SORT) next.delete("sort");
    else next.set("sort", flipped);
    next.delete("page");
    replaceQuery(next.toString());
  }

  /** The empty filtered list's way back: every filter goes, the tab stays. */
  function resetFilters() {
    replaceQuery(tab === "all" ? "" : new URLSearchParams({ tab }).toString());
  }

  return (
    <>
      {/* Below lg the rows stack into cards and the header row is only read aloud, so the sort
          gets its own button there. A month has no order to turn over. */}
      {tasks.length > 0 && !calendarToday ? (
        <DeadlineSortButton sort={sort} onToggle={toggleSort} />
      ) : null}

      {/* The region the tabs switch, named by the tabs' aria-controls. */}
      <section
        ref={listRef}
        id={MY_TASK_LIST_ID}
        role="tabpanel"
        aria-label="Daftar Tugas Saya"
        tabIndex={-1}
        className="outline-none"
      >
        {calendarToday ? (
          <TaskCalendar
            tasks={tasks}
            today={calendarToday}
            opensOn={calendarOpensOn}
            onOpen={setDetailContentId}
          />
        ) : filtered && tasks.length === 0 ? (
          <FilteredEmpty title={MY_TASKS_FILTERED_EMPTY} onReset={resetFilters} />
        ) : (
          <MyTaskTable
            tasks={tasks}
            emptyMessage={MY_TASKS_EMPTY[tab]}
            // New work lands in Semua and Perlu Dikerjakan, never straight in the other two tabs.
            emptyHint={tab === "all" || tab === "action" ? undefined : null}
            sort={sort}
            onSortToggle={toggleSort}
            onDetail={(task) => setDetailContentId(task.id)}
          />
        )}
      </section>
      {detailContentId ? (
        <ContentDetailPanel
          key={detailContentId}
          contentId={detailContentId}
          role="creator"
          onClose={closeDetail}
        />
      ) : null}
    </>
  );
}
