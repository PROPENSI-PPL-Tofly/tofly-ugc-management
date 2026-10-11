"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ContentDetailPanel } from "@/components/content-detail/content-detail-panel";
import { SubmitDraftModal } from "@/components/my-task/submit-draft-modal";
import { SubmitVideoModal } from "@/components/my-task/submit-video-modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { DeadlineSort } from "@/lib/content-plan";
import {
  DEFAULT_MY_TASKS_SORT,
  MY_TASKS_EMPTY,
  MY_TASKS_FILTERED_EMPTY,
  type MyTask,
  type MyTaskAction,
  type MyTaskTab,
} from "@/lib/my-tasks";
import { latestQuery, useUrlQuery } from "@/lib/url-query";
import { MY_TASK_LIST_ID } from "./my-task-tab-bar";
import { MyTaskTable } from "./my-task-table";

interface Opened {
  task: MyTask;
  action: MyTaskAction;
}

/** The search parameter a notification or a bookmark uses to open one content's panel. */
const CONTENT_PARAM = "content";

const SUBMITTED: Record<MyTaskAction, string> = {
  submit_draft: "Draft terkirim. Admin akan meninjaunya.",
  resubmit_draft: "Draft terkirim. Admin akan meninjaunya.",
  submit_video: "Link video terkirim. Konten ini selesai.",
};

/**
 * Task Saya's interactive part: the table plus the modal its buttons open and the deadline
 * sort. The page fetches on the server and cannot hold "which task is open", so this client
 * component does. After a hand-in the page is refreshed, which re-fetches the list with the
 * row's new status, and a toast confirms it. Focus then goes to the list: the button that
 * opened the modal usually disappears with the new status, which would otherwise drop focus to
 * the page body.
 */
export function MyTaskBoard({
  tasks,
  tab,
  sort,
  filtered,
}: Readonly<{
  tasks: MyTask[];
  tab: MyTaskTab;
  sort: DeadlineSort;
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered: boolean;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { replaceQuery, replaceQuietly } = useUrlQuery();
  const [opened, setOpened] = useState<Opened | null>(null);
  // The content whose detail panel is open; keyed by content so a ?content= link can
  // deep-link into it the way a notification would.
  const [detailContentId, setDetailContentId] = useState<string | null>(null);
  const { show: confirm, toast } = useToast();
  const listRef = useRef<HTMLElement>(null);
  const focusListOnClose = useRef(false);

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

  // Runs after the modal's own cleanup has handed focus back to its opener, so this wins.
  useEffect(() => {
    if (opened === null && focusListOnClose.current) {
      focusListOnClose.current = false;
      listRef.current?.focus();
    }
  }, [opened]);

  const close = () => setOpened(null);

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

  /** A command inside the panel hands its action back here: the row's submit modal owns it. */
  function openSubmitFromPanel(contentId: string, action: MyTaskAction) {
    const task = tasks.find((candidate) => candidate.id === contentId);
    closeDetail();
    if (task) {
      setOpened({ task, action });
    }
  }

  function renderModal(current: Opened) {
    const { id, name, deadline, brief, revisionNotes } = current.task;
    const content = { id, name, deadline, brief, revisionNotes };
    const submitted = () => {
      focusListOnClose.current = true;
      confirm(SUBMITTED[current.action]);
      router.refresh();
    };
    // Keyed by task and action so opening another row starts from an empty form.
    const key = `${id}:${current.action}`;

    if (current.action === "submit_video") {
      return (
        <SubmitVideoModal
          key={key}
          content={content}
          onClose={close}
          onSubmitted={submitted}
        />
      );
    }

    return (
      <SubmitDraftModal
        key={key}
        action={current.action}
        content={content}
        onClose={close}
        onSubmitted={submitted}
      />
    );
  }

  return (
    <>
      {/* The region the tabs switch, named by the tabs' aria-controls. */}
      <section
        ref={listRef}
        id={MY_TASK_LIST_ID}
        role="tabpanel"
        aria-label="Daftar Tugas Saya"
        tabIndex={-1}
        className="outline-none"
      >
        <MyTaskTable
          tasks={tasks}
          emptyMessage={filtered ? MY_TASKS_FILTERED_EMPTY : MY_TASKS_EMPTY[tab]}
          emptyAction={
            filtered ? (
              <Button onClick={resetFilters}>Reset filter</Button>
            ) : undefined
          }
          sort={sort}
          onSortToggle={toggleSort}
          onAction={(task, action) => setOpened({ task, action })}
          onDetail={(task) => setDetailContentId(task.id)}
        />
      </section>
      {opened ? renderModal(opened) : null}
      {detailContentId ? (
        <ContentDetailPanel
          key={detailContentId}
          contentId={detailContentId}
          role="creator"
          onClose={closeDetail}
          ports={{
            onCreatorAction: (action) => openSubmitFromPanel(detailContentId, action),
          }}
        />
      ) : null}
      {toast}
    </>
  );
}
