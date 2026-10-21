"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/pill";
import { PHONE_TARGET } from "@/components/ui/touch-target";
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

// On a phone a chip is only a dot, and seven days share the row: the press spans its whole day
// (the cell's padding included) and is 44px tall, while the wash behind the dot is dropped, so
// the press grows and the mark does not. The day grows to fit.
const CHIP = `block w-full cursor-pointer truncate rounded-(--radius-control) border-none px-1.5 py-0.5 text-left text-[11.5px] font-semibold ${PHONE_TARGET} max-sm:-mx-1.5 max-sm:w-auto max-sm:bg-transparent`;

const NAV = `cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-2 text-base leading-7 text-ink-2 hover:border-ink-2 ${PHONE_TARGET} max-sm:min-w-11`;

const DAYS_PER_WEEK = WEEKDAYS.length;

// A day's date is the button that chooses it; plain text until hovered, like the date it was.
const DAY = `mb-1 flex h-6 w-full cursor-pointer items-center rounded-(--radius-control) px-1 text-left text-xs ${PHONE_TARGET}`;

/** How a day button reads: its date and how many tasks fall on it. */
function dayLabel(day: string, count: number): string {
  return `${formatDate(day)}, ${count > 0 ? `${count} task` : "tidak ada task"}`;
}

/** The month a calendar day falls in. */
function monthOf(day: string): CalendarMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/**
 * Task Saya as a month (PBI-7, subtask 7.3): each task is a chip on its deadline day, coloured
 * by whose move it is, as the prototype's calendar draws it. It shows the tasks it is handed
 * and reports the chip that was pressed; loading tasks and opening the panel are the board's.
 *
 * A day can be chosen by its date (client feedback C2): the list under the grid then holds
 * that day alone. The choice is the calendar's own, like the month it shows, so it never
 * touches the filters, the tab or the view; new tasks from a filter keep it, and turning the
 * month lets go of it.
 */
export function TaskCalendar({
  tasks,
  today,
  opensOn = null,
  onOpen,
}: Readonly<{
  tasks: readonly MyTask[];
  /** Today's calendar day in Jakarta, "YYYY-MM-DD", read once by the server. */
  today: string;
  /**
   * The day whose month the calendar opens on, when a deadline range names one, so a range in
   * another month is not shown as an empty grid. Today's month otherwise.
   */
  opensOn?: string | null;
  /** Called with the content id of the chip that was pressed. */
  onOpen: (contentId: string) => void;
}>) {
  const current = monthOf(today);
  const [shown, setShown] = useState<CalendarMonth>(opensOn ? monthOf(opensOn) : current);
  const [chosen, setChosen] = useState<string | null>(null);
  const agendaHeading = useId();
  const isCurrent = shown.year === current.year && shown.month === current.month;

  function turnTo(month: CalendarMonth) {
    setShown(month);
    setChosen(null);
  }

  const cells = monthGrid(shown, tasks, today);
  const weeks = Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  // The shown month's tasks, already in date order: the grid walks its days from the 1st.
  const monthTasks = cells.flatMap((cell) => cell?.tasks ?? []);
  const listed = chosen ? monthTasks.filter((task) => task.deadline === chosen) : monthTasks;

  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex items-center gap-2.5">
        <Button disabled={isCurrent} onClick={() => turnTo(current)}>
          Hari Ini
        </Button>
        <button
          type="button"
          aria-label="Bulan Sebelumnya"
          className={NAV}
          onClick={() => turnTo(shiftMonth(shown, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Bulan Berikutnya"
          className={NAV}
          onClick={() => turnTo(shiftMonth(shown, 1))}
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
                    data-selected={chosen === cell.day ? "" : undefined}
                    aria-current={cell.isToday ? "date" : undefined}
                    className={`h-24 border border-rule p-1.5 align-top ${cell.isToday ? "bg-accent-wash" : ""} ${chosen === cell.day ? "outline-2 -outline-offset-2 outline-accent" : ""}`}
                  >
                    {/* Pressed again, the chosen day lets go and the list holds the month. */}
                    <button
                      type="button"
                      aria-pressed={chosen === cell.day}
                      aria-label={dayLabel(cell.day, cell.tasks.length)}
                      onClick={() => setChosen(chosen === cell.day ? null : cell.day)}
                      className={`${DAY} ${
                        chosen === cell.day
                          ? "bg-accent font-bold text-accent-ink"
                          : `hover:bg-surface-2 ${cell.isToday ? "font-bold text-accent-deep" : "text-muted"}`
                      }`}
                    >
                      {cell.date}
                    </button>
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

      {/* The month's list is for small screens: the grid shows where the deadlines fall, this
          says what they are. A chosen day's list shows at every width. */}
      <section aria-labelledby={agendaHeading} className={`mt-4 ${chosen ? "" : "sm:hidden"}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div aria-live="polite">
            <h4 id={agendaHeading} className="text-xs font-semibold text-muted">
              {chosen ? `Task ${formatDate(chosen)}` : "Task bulan ini"}
            </h4>
          </div>
          {chosen ? (
            <button
              type="button"
              onClick={() => setChosen(null)}
              className={`cursor-pointer rounded-(--radius-control) px-2 py-1 text-xs font-semibold text-accent-deep hover:bg-surface-2 ${PHONE_TARGET}`}
            >
              Lihat sebulan
            </button>
          ) : null}
        </div>
        {listed.length === 0 ? (
          <p className="text-xs text-muted">
            {chosen ? "Tidak ada task di tanggal ini." : "Tidak ada task di bulan ini."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {listed.map((task) => (
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
