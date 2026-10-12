"use client";

import type { ReactNode } from "react";
import { ContentTags } from "@/components/contents/content-tags";
import { Button } from "@/components/ui/button";
import type { Variant } from "@/components/ui/button-classes";
import { DeadlineSortTh } from "@/components/content-plan/deadline-sort";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_TONES, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import type { DeadlineSort } from "@/lib/content-plan";
import { formatDate } from "@/lib/format";
import { taskStatusLabel, type MyTask, type MyTaskAction } from "@/lib/my-tasks";
import { creatorActionLabel } from "@/lib/panel-actions";

// From lg up this is a plain table. Below it (where the sidebar leaves too little width for four
// columns) each row stacks into a card so the deadline, status and action stay on screen instead
// of behind a sideways scroll: the header row is visually hidden, and the deadline and status
// cells print their column name from data-label.
const HEAD = "px-5 py-3 font-semibold";

/** Column widths from lg up: Nama Konten, Deadline, Status, Aksi; without Aksi on Selesai. */
const COLUMNS = ["w-[30%]", "w-[13%]", "w-[29%]", "w-[28%]"];
const COLUMNS_WITHOUT_ACTIONS = ["w-[46%]", "w-[20%]", "w-[34%]"];
const CELL = "px-5 py-3 align-middle max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

/**
 * Each button takes the tone of the state it answers, the same colours as the status dots:
 * a first draft is the plain primary step (blue), a resubmit answers a revision request
 * (amber), and the video link follows an approval (green). Inside the H-1 window the link may
 * skip the approval, but that is the fallback, so there it stays neutral.
 */
function actionVariant(task: MyTask, action: MyTaskAction): Variant {
  if (action === "submit_draft") return "accent";
  if (action === "resubmit_draft") return "attention";
  return task.status === "draft_approved" ? "positive" : "default";
}

/** What an action-less row says instead of a button; nothing once the work is done. */
function idleText(task: MyTask): string | null {
  return task.status === "draft_review" ? "Menunggu review admin" : null;
}

function ActionCell({
  task,
  now,
  onAction,
}: Readonly<{
  task: MyTask;
  now: Date;
  onAction?: (task: MyTask, action: MyTaskAction) => void;
}>) {
  if (task.actions.length === 0) {
    const idle = idleText(task);
    return idle ? <span className="text-xs text-muted">{idle}</span> : null;
  }

  return (
    // Above the row-wide name button, so a press on an action is the action alone.
    <div className="relative z-10 flex flex-wrap gap-2">
      {task.actions.map((action) => {
        // Worded as the detail panel words it: the link of a draft still in review is the H-1
        // route, or a late one, not the planned step after an approval.
        const label = creatorActionLabel(action, task, now);

        return (
          <Button
            key={action}
            variant={actionVariant(task, action)}
            className="whitespace-nowrap"
            // Every row repeats the same labels, so each button names its task for a screen
            // reader, keeping the visible label at the front.
            aria-label={`${label}: ${task.name}`}
            disabled={!onAction}
            onClick={() => onAction?.(task, action)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Task Saya's table (PRD 3.16). Rows arrive in display order with the actions the backend
 * allows today; the table only renders them. What an action does (the Submit Draft and Submit
 * Link Video modals) is the page's business, reached through `onAction`; without it the
 * buttons show but cannot be pressed.
 */
export function MyTaskTable({
  tasks,
  onAction,
  onDetail,
  emptyMessage = "Belum ada tugas untuk kamu.",
  emptyAction,
  emptyHint = "Tugas baru muncul di sini begitu admin menjadwalkannya.",
  sort = "asc",
  onSortToggle,
  hideActions = false,
  now = new Date(),
}: Readonly<{
  tasks: MyTask[];
  onAction?: (task: MyTask, action: MyTaskAction) => void;
  /** Opens the row's content detail panel; every row can show its journey. */
  onDetail?: (task: MyTask) => void;
  /** What an empty list means, e.g. that a status filter matched nothing. */
  emptyMessage?: string;
  /** The way out of an empty list, e.g. clearing the filter that emptied it. */
  emptyAction?: ReactNode;
  /** The line under an empty list's message; null where it would not be true (a finished tab). */
  emptyHint?: string | null;
  /** Which way the deadline runs; only shown when the page can turn it over. */
  sort?: DeadlineSort;
  /** Turns the deadline order over; given, the Deadline header becomes its button. */
  onSortToggle?: () => void;
  /** Leaves out the Aksi column, for a list that never has anything to do (Selesai). */
  hideActions?: boolean;
  /** The moment the buttons are worded for; a test pins it. */
  now?: Date;
}>) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        hint={emptyAction ? undefined : (emptyHint ?? undefined)}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block lg:table-fixed">
        <caption className="sr-only">Daftar Tugas Saya</caption>
        {/* Fixed widths, as in the prototype: a page of short names or no buttons keeps the
            columns where they were. Hidden below lg, where the rows are cards. */}
        <colgroup className="max-lg:hidden">
          {(hideActions ? COLUMNS_WITHOUT_ACTIONS : COLUMNS).map((width) => (
            <col key={width} className={width} />
          ))}
        </colgroup>
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" scope="col" className={HEAD}>
              Nama Konten
            </th>
            {onSortToggle ? (
              <DeadlineSortTh sort={sort} onToggle={onSortToggle} />
            ) : (
              <th role="columnheader" scope="col" className={HEAD}>
                Deadline
              </th>
            )}
            <th role="columnheader" scope="col" className={HEAD}>
              Status
            </th>
            {hideActions ? null : (
              <th role="columnheader" scope="col" className={HEAD}>
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:block">
          {tasks.map((task) => (
            // A press anywhere on the row opens its detail, as in the prototype: the name's button
            // is stretched over the row (relative here), so the press lands on a real button and
            // the keyboard and screen readers reach it the same way.
            <tr
              key={task.id}
              role="row"
              className={`border-b border-rule last:border-none max-lg:block max-lg:px-5 max-lg:py-3 lg:h-16 ${
                onDetail ? "relative cursor-pointer transition-colors hover:bg-surface-2" : ""
              }`}
            >
              <td role="cell" className={`${CELL} wrap-anywhere max-lg:font-semibold`}>
                {/* Reads as plain text; its ::after covers the row, and a keyboard focus rings the row. */}
                {onDetail ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => onDetail(task)}
                    className="cursor-pointer border-none bg-transparent p-0 text-left text-inherit after:absolute after:inset-0 focus-visible:outline-none! focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                  >
                    {task.name}
                  </button>
                ) : (
                  task.name
                )}
                {/* The type as quiet text, as the admin's Content Plan shows it: a fact, not a judgment. */}
                <span className="block text-xs font-normal text-muted">{CONTENT_TYPE_LABELS[task.type]}</span>
              </td>
              <td role="cell" data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                {formatDate(task.deadline)}
              </td>
              <td role="cell" data-label="Status" className={`${CELL} ${LABELLED}`}>
                {/* The tags sit beside the status, apart from it, as in the admin's views. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusDot tone={CONTENT_STATUS_TONES[task.status]}>
                    {taskStatusLabel(task.status)}
                  </StatusDot>
                  <ContentTags tags={task.tags} />
                </div>
              </td>
              {hideActions ? null : (
                <td className={`${CELL} max-lg:pt-2 max-lg:empty:hidden`}>
                  <ActionCell task={task} now={now} onAction={onAction} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
