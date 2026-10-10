"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Variant } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { EMPTY, formatDate } from "@/lib/format";
import { taskStatusLabel, type MyTask, type MyTaskAction } from "@/lib/my-tasks";

const ACTION_LABELS: Record<MyTaskAction, string> = {
  submit_draft: "Submit Draft",
  resubmit_draft: "Resubmit Draft",
  submit_video: "Submit Link Video",
};

// From lg up this is a plain table. Below it (where the sidebar leaves too little width for four
// columns) each row stacks into a card so the deadline, status and action stay on screen instead
// of behind a sideways scroll: the header row is visually hidden, and the deadline and status
// cells print their column name from data-label.
const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top max-lg:block max-lg:px-0 max-lg:py-1";
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

/** What an action-less row says instead of a button. */
function idleText(task: MyTask): string {
  return task.status === "draft_review" ? "Menunggu review admin" : EMPTY;
}

function ActionCell({
  task,
  onAction,
  onDetail,
}: Readonly<{
  task: MyTask;
  onAction?: (task: MyTask, action: MyTaskAction) => void;
  onDetail?: (task: MyTask) => void;
}>) {
  const detailButton = onDetail ? (
    <Button
      key="detail"
      variant="ghost"
      className="whitespace-nowrap"
      aria-label={`Detail: ${task.name}`}
      onClick={() => onDetail(task)}
    >
      Detail
    </Button>
  ) : null;

  if (task.actions.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{idleText(task)}</span>
        {detailButton}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {task.actions.map((action) => (
        <Button
          key={action}
          variant={actionVariant(task, action)}
          className="whitespace-nowrap"
          // Every row repeats the same labels, so each button names its task for a screen
          // reader, keeping the visible label at the front.
          aria-label={`${ACTION_LABELS[action]}: ${task.name}`}
          disabled={!onAction}
          onClick={() => onAction?.(task, action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
      {detailButton}
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
}: Readonly<{
  tasks: MyTask[];
  onAction?: (task: MyTask, action: MyTaskAction) => void;
  /** Opens the row's content detail panel; every row can show its journey. */
  onDetail?: (task: MyTask) => void;
  /** What an empty list means, e.g. that a status filter matched nothing. */
  emptyMessage?: string;
  /** The way out of an empty list, e.g. clearing the filter that emptied it. */
  emptyAction?: ReactNode;
}>) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        hint={emptyAction ? undefined : "Tugas baru muncul di sini begitu admin menjadwalkannya."}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <caption className="sr-only">Daftar Tugas Saya</caption>
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" scope="col" className={HEAD}>
              Nama Konten
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Deadline
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Status
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Aksi
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:block">
          {tasks.map((task) => (
            <tr
              key={task.id}
              role="row"
              className="border-b border-rule last:border-none max-lg:block max-lg:px-5 max-lg:py-3"
            >
              <td role="cell" className={`${CELL} min-w-48 wrap-anywhere max-lg:min-w-0 max-lg:font-semibold`}>
                {task.name}
              </td>
              <td role="cell" data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                {formatDate(task.deadline)}
              </td>
              <td role="cell" data-label="Status" className={`${CELL} ${LABELLED} lg:whitespace-nowrap`}>
                <StatusDot tone={CONTENT_STATUS_TONES[task.status]}>
                  {taskStatusLabel(task.status)}
                </StatusDot>
              </td>
              <td role="cell" className={`${CELL} max-lg:pt-2`}>
                <ActionCell task={task} onAction={onAction} onDetail={onDetail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
