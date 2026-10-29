"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS } from "@/lib/content-labels";
import { formatDate } from "@/lib/format";
import type { MyTask } from "@/lib/my-tasks";
import {
  CALENDAR_GROUPS,
  calendarChipLabel,
  calendarGroup,
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
  type CalendarGroup,
  type CalendarGroupDef,
  type CalendarMonth,
} from "@/lib/task-calendar";

// A chip takes its group's colour, the same wash-and-ink pairs the app's pills use.
const CHIP_TONES: Record<CalendarGroup, string> = {
  todo: "bg-amber-wash text-amber-ink",
  wait: "bg-surface-2 text-ink-2",
  done: "bg-green-wash text-green-ink",
  overdue: "bg-red-wash text-red-ink",
};

// On a small screen a day column is too narrow for a name, so a chip shrinks to this dot.
const DOT_TONES: Record<CalendarGroup, string> = {
  todo: "bg-amber",
  wait: "bg-ink-2",
  done: "bg-green",
  overdue: "bg-red",
};

const GROUP_BY_KEY = Object.fromEntries(
  CALENDAR_GROUPS.map((group) => [group.key, group]),
) as Record<CalendarGroup, CalendarGroupDef>;

const CHIP =
  "block w-full cursor-pointer truncate rounded-(--radius-control) border-none px-1.5 py-0.5 text-left text-[11.5px] font-semibold";

const NAV =
  "cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-2 text-base leading-7 text-ink-2 hover:border-ink-2";

const DAYS_PER_WEEK = WEEKDAYS.length;

/** The month a calendar day falls in. */
function monthOf(day: string): CalendarMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/**
 * Task Saya as a month (PBI-7, subtask 7.3): each task is a chip on its deadline day, coloured
 * by whose move it is, as the prototype's calendar draws it. It shows the tasks it is handed
 * and reports the chip that was pressed; loading tasks and opening the panel are the board's.
 */
export function TaskCalendar({
  tasks,
  today,
  onOpen,
}: Readonly<{
  tasks: readonly MyTask[];
  /** Today's calendar day in Jakarta, "YYYY-MM-DD", read once by the server. */
  today: string;
  /** Called with the content id of the chip that was pressed. */
  onOpen: (contentId: string) => void;
}>) {
  const current = monthOf(today);
  const [shown, setShown] = useState<CalendarMonth>(current);
  const isCurrent = shown.year === current.year && shown.month === current.month;

  const cells = monthGrid(shown, tasks, today);
  const weeks = Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  // The shown month's tasks, already in date order: the grid walks its days from the 1st.
  const monthTasks = cells.flatMap((cell) => cell?.tasks ?? []);

  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex items-center gap-2.5">
        <Button disabled={isCurrent} onClick={() => setShown(current)}>
          Hari Ini
        </Button>
        <button
          type="button"
          aria-label="Bulan Sebelumnya"
          className={NAV}
          onClick={() => setShown(shiftMonth(shown, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Bulan Berikutnya"
          className={NAV}
          onClick={() => setShown(shiftMonth(shown, 1))}
        >
          ›
        </button>
        <h3 className="text-[15px]">{monthLabel(shown)}</h3>
      </div>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday}
                scope="col"
                className="pb-1.5 text-left text-[11px] font-semibold text-muted"
              >
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}>
              {week.map((cell, column) =>
                cell === null ? (
                  <td key={column} className="border border-rule bg-surface-2" />
                ) : (
                  <td
                    key={cell.day}
                    data-day={cell.day}
                    aria-current={cell.isToday ? "date" : undefined}
                    className={`h-24 border border-rule p-1.5 align-top ${cell.isToday ? "bg-accent-wash" : ""}`}
                  >
                    <p
                      className={`mb-1 text-xs ${cell.isToday ? "font-bold text-accent-deep" : "text-muted"}`}
                    >
                      {cell.date}
                    </p>
                    <div className="flex flex-col gap-1">
                      {cell.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          data-group={calendarGroup(task)}
                          aria-label={`${task.name} · ${CONTENT_STATUS_LABELS[task.status]}`}
                          title={`${task.name} · ${CONTENT_STATUS_LABELS[task.status]}`}
                          onClick={() => onOpen(task.id)}
                          className={`${CHIP} ${CHIP_TONES[calendarGroup(task)]}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mx-auto block size-2 rounded-full sm:hidden ${DOT_TONES[calendarGroup(task)]}`}
                          />
                          <span className="sr-only sm:not-sr-only">{calendarChipLabel(task)}</span>
                        </button>
                      ))}
                    </div>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul
        aria-label="Keterangan warna"
        className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
      >
        {CALENDAR_GROUPS.map((group) => (
          <li key={group.key}>
            <StatusDot tone={group.tone}>{group.label}</StatusDot>
          </li>
        ))}
        <li>
          <StatusDot tone="accent">Hari Ini</StatusDot>
        </li>
      </ul>

      {/* Small screens only: the grid shows where the deadlines fall, this says what they are. */}
      <section aria-label="Task bulan ini" className="mt-4 sm:hidden">
        <h4 className="mb-2 text-xs font-semibold text-muted">Task bulan ini</h4>
        {monthTasks.length === 0 ? (
          <p className="text-xs text-muted">Tidak ada task di bulan ini.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {monthTasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onOpen(task.id)}
                  className="flex w-full cursor-pointer flex-col gap-0.5 rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-left hover:border-ink-2"
                >
                  <span className="text-[11.5px] text-muted">{formatDate(task.deadline)}</span>
                  <span className="wrap-anywhere text-[13px] font-semibold text-ink">
                    {task.name}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    <StatusDot tone={GROUP_BY_KEY[calendarGroup(task)].tone}>
                      {GROUP_BY_KEY[calendarGroup(task)].label}
                    </StatusDot>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
