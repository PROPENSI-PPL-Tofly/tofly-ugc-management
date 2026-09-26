"use client";

import { Button } from "@/components/ui/button";
import type { Variant } from "@/components/ui/button-classes";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS } from "@/lib/content-labels";
import { EMPTY, formatDate } from "@/lib/format";
import type { MyTask, MyTaskAction } from "@/lib/my-tasks";

const ACTION_LABELS: Record<MyTaskAction, string> = {
  submit_draft: "Submit Draft",
  resubmit_draft: "Resubmit Draft",
  submit_video: "Submit Link Video",
};

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

/**
 * Submitting a draft is always the main step. The video link is the main step only once the
 * draft is approved; inside the H-1 window it may skip the approval, but that is the fallback,
 * so it stays secondary there.
 */
function actionVariant(task: MyTask, action: MyTaskAction): Variant {
  if (action !== "submit_video") return "accent";
  return task.status === "draft_approved" ? "accent" : "default";
}

/** What an action-less row says instead of a button. */
function idleText(task: MyTask): string {
  return task.status === "draft_review" || task.status === "draft_revised"
    ? "Menunggu review admin"
    : EMPTY;
}

function ActionCell({
  task,
  onAction,
}: Readonly<{ task: MyTask; onAction?: (task: MyTask, action: MyTaskAction) => void }>) {
  if (task.actions.length === 0) {
    return <span className="text-xs text-muted">{idleText(task)}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {task.actions.map((action) => (
        <Button
          key={action}
          variant={actionVariant(task, action)}
          // Every row repeats the same labels, so each button names its task for a screen
          // reader, keeping the visible label at the front.
          aria-label={`${ACTION_LABELS[action]}: ${task.name}`}
          disabled={!onAction}
          onClick={() => onAction?.(task, action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
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
}: Readonly<{
  tasks: MyTask[];
  onAction?: (task: MyTask, action: MyTaskAction) => void;
}>) {
  if (tasks.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold text-muted">Belum ada tugas untuk kamu.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Daftar Tugas Saya</caption>
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th scope="col" className={HEAD}>
              Nama Konten
            </th>
            <th scope="col" className={HEAD}>
              Deadline
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-rule last:border-none">
              <td className={`${CELL} break-words`}>{task.name}</td>
              <td className={`${CELL} whitespace-nowrap`}>{formatDate(task.deadline)}</td>
              <td className={CELL}>
                <StatusDot>{CONTENT_STATUS_LABELS[task.status]}</StatusDot>
              </td>
              <td className={CELL}>
                <ActionCell task={task} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
