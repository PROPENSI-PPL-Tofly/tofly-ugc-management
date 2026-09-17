"use client";

import { Button } from "@/components/ui/button";
import { Pill, StatusDot } from "@/components/ui/pill";
import { formatDate } from "@/lib/format";
import {
  formatDeadlineDistance,
  type MyTask,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from "@/lib/tasks";

const COLUMNS = ["Nama Konten", "Deadline", "Status"];

const CELL = "border-b border-line px-5 py-3.5 align-top text-[13px]";

export function TaskTable({
  tasks,
  onSubmitDraft,
  onSubmitVideo,
}: {
  tasks: MyTask[];
  onSubmitDraft?: (task: MyTask) => void;
  onSubmitVideo?: (task: MyTask) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold">Belum ada tugas</p>
        <p className="mt-1 text-[13px] text-muted">
          Konten yang ditugaskan kepadamu akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-line px-5 pb-2.5 pt-3 text-left text-xs font-semibold text-muted"
              >
                {column}
              </th>
            ))}
            <th scope="col" className="border-b border-line px-5">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const done = task.status === "link_submitted";
            return (
              <tr key={task.id} className="hover:bg-surface-low">
                <td className={CELL}>
                  <p className="text-sm font-semibold text-ink">{task.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{TYPE_LABELS[task.type]}</p>
                </td>

                <td className={`${CELL} whitespace-nowrap`}>
                  <p>{formatDate(task.deadline)}</p>
                  {done ? null : (
                    <p
                      className={`text-xs ${task.daysUntilDeadline < 0 ? "font-medium text-red" : "text-muted"}`}
                    >
                      {formatDeadlineDistance(task.daysUntilDeadline)}
                    </p>
                  )}
                </td>

                <td className={CELL}>
                  <StatusDot tone={STATUS_TONES[task.status]}>{STATUS_LABELS[task.status]}</StatusDot>
                  {task.actions.inGracePeriod ? (
                    <p className="mt-1.5">
                      <Pill tone="amber">Masa tenggang H-1</Pill>
                    </p>
                  ) : null}
                </td>

                <td className={`${CELL} whitespace-nowrap`}>
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={!task.actions.canSubmitDraft}
                      onClick={() => onSubmitDraft?.(task)}
                    >
                      {task.actions.isResubmission ? "Resubmit Draft" : "Submit Draft"}
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!task.actions.canSubmitVideo}
                      onClick={() => onSubmitVideo?.(task)}
                    >
                      Submit Link Video
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
