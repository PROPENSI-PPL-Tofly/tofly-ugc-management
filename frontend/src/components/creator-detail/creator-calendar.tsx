"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS } from "@/lib/content-labels";
import {
  CREATOR_CALENDAR_GROUPS,
  creatorCalendarGroup,
  isInPeriod,
  periodMonths,
  type CreatorCalendarGroup,
  type CreatorCalendarGroupDef,
} from "@/lib/creator-calendar";
import type { CreatorContentRow, CreatorPeriod } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";
import {
  calendarChipLabel,
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
  type CalendarMonth,
} from "@/lib/task-calendar";

// A chip takes its group's colour, the same wash-and-ink pairs the app's pills use.
const CHIP_TONES: Record<CreatorCalendarGroup, string> = {
  action: "bg-amber-wash text-amber-ink",
  waiting: "bg-surface-2 text-ink-2",
  done: "bg-green-wash text-green-ink",
  overdue: "bg-red-wash text-red-ink",
};

// On a small screen a day column is too narrow for a name, so a chip shrinks to this dot.
const DOT_TONES: Record<CreatorCalendarGroup, string> = {
  action: "bg-amber",
  waiting: "bg-ink-2",
  done: "bg-green",
  overdue: "bg-red",
};

const GROUP_BY_KEY = Object.fromEntries(
  CREATOR_CALENDAR_GROUPS.map((group) => [group.key, group]),
) as Record<CreatorCalendarGroup, CreatorCalendarGroupDef>;

const CHIP =
  "block w-full cursor-pointer truncate rounded-(--radius-control) border-none px-1.5 py-0.5 text-left text-[11.5px] font-semibold";

const NAV =
  "cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-2 text-base leading-7 text-ink-2 hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-rule";

const DAYS_PER_WEEK = WEEKDAYS.length;

function sameMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** What a chip and its row say to a screen reader: the content, then its status. */
function spoken(entry: CreatorContentRow): string {
  return `${entry.name} · ${CONTENT_STATUS_LABELS[entry.status]}`;
}

/**
 * One contract period as months (the prototype's Jadwal Konten): each content a chip on its
 * deadline day, coloured by the Content Plan tab that holds it and named, so colour is never
 * the only signal. The months are the period's own: the arrows stop at its first and last, and
 * the days around it are dimmed. It shows what it is handed and reports the chip pressed;
 * loading the period and opening the panel are the board's.
 *
 * Reuse over a second grid: the weeks, the month names and the chip labels are Task Saya's
 * (task-calendar), so both calendars lay out a month the same way.
 */
export function CreatorCalendar({
  period,
  entries,
  today,
  onOpen,
}: Readonly<{
  period: CreatorPeriod;
  /** The whole period's content, in deadline order. */
  entries: readonly CreatorContentRow[];
  /** Today in Jakarta, "YYYY-MM-DD", read once by the server. */
  today: string;
  onOpen: (contentId: string) => void;
}>) {
  const { first, last, opening } = periodMonths(period, today);
  const [shown, setShown] = useState<CalendarMonth>(opening);
  const todayInPeriod = isInPeriod(today, period);

  const cells = monthGrid(shown, entries, today);
  const weeks = Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  // The shown month's content, already in date order: the grid walks its days from the 1st.
  const monthEntries = cells.flatMap((cell) => cell?.tasks ?? []);

  return (
    <Panel>
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[15px]">Jadwal Konten</h2>
      </div>

      <div className="px-5 pb-5">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Button disabled={!todayInPeriod || sameMonth(shown, opening)} onClick={() => setShown(opening)}>
            Hari Ini
          </Button>
          <button
            type="button"
            aria-label="Bulan Sebelumnya"
            className={NAV}
            disabled={sameMonth(shown, first)}
            onClick={() => setShown(shiftMonth(shown, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Bulan Berikutnya"
            className={NAV}
            disabled={sameMonth(shown, last)}
            onClick={() => setShown(shiftMonth(shown, 1))}
          >
            ›
          </button>
          <h3 className="text-[15px]">{monthLabel(shown)}</h3>
          {/* Said in words, as a disabled button cannot say why it is off. */}
          {todayInPeriod ? null : <p className="text-xs text-muted">Hari ini di luar periode ini.</p>}
        </div>

        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {WEEKDAYS.map((weekday) => (
                <th key={weekday} scope="col" className="pb-1.5 text-left text-[11px] font-semibold text-muted">
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={index}>
                {week.map((cell, column) => {
                  if (cell === null) return <td key={column} className="border border-rule bg-surface-2" />;

                  const outside = !isInPeriod(cell.day, period);
                  let tone = "";
                  if (cell.isToday) tone = "bg-accent-wash";
                  else if (outside) tone = "bg-surface-2";

                  return (
                    <td
                      key={cell.day}
                      data-day={cell.day}
                      data-outside={outside ? "true" : undefined}
                      aria-current={cell.isToday ? "date" : undefined}
                      className={`h-20 border border-rule p-1.5 align-top ${tone}`}
                    >
                      <p
                        className={`mb-1 text-xs ${cell.isToday ? "font-bold text-accent-deep" : "text-muted"} ${outside ? "opacity-60" : ""}`}
                      >
                        {cell.date}
                        {outside ? <span className="sr-only">di luar periode</span> : null}
                      </p>
                      <div className="flex flex-col gap-1">
                        {cell.tasks.map((entry) => {
                          const group = creatorCalendarGroup(entry);
                          return (
                            <button
                              key={entry.contentId}
                              type="button"
                              data-group={group}
                              aria-label={spoken(entry)}
                              title={spoken(entry)}
                              onClick={() => onOpen(entry.contentId)}
                              className={`${CHIP} ${CHIP_TONES[group]}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`mx-auto block size-2 rounded-full sm:hidden ${DOT_TONES[group]}`}
                              />
                              <span className="sr-only sm:not-sr-only">{calendarChipLabel(entry)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label="Keterangan warna" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {CREATOR_CALENDAR_GROUPS.map((group) => (
            <li key={group.key}>
              <StatusDot tone={group.tone}>{group.label}</StatusDot>
            </li>
          ))}
          <li>
            <StatusDot tone="accent">Hari Ini</StatusDot>
          </li>
        </ul>

        {/* Small screens only: the grid shows where the deadlines fall, this says what they are. */}
        <section aria-label="Konten bulan ini" className="mt-4 sm:hidden">
          <h4 className="mb-2 text-xs font-semibold text-muted">Konten bulan ini</h4>
          {monthEntries.length === 0 ? (
            <p className="text-xs text-muted">Tidak ada konten di bulan ini.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {monthEntries.map((entry) => {
                const group = GROUP_BY_KEY[creatorCalendarGroup(entry)];
                return (
                  <li key={entry.contentId}>
                    <button
                      type="button"
                      onClick={() => onOpen(entry.contentId)}
                      className="flex w-full cursor-pointer flex-col gap-0.5 rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-left hover:border-ink-2"
                    >
                      <span className="text-[11.5px] text-muted">{formatDate(entry.deadline)}</span>
                      <span className="wrap-anywhere text-[13px] font-semibold text-ink">{entry.name}</span>
                      <span className="text-[11.5px] text-muted">
                        <StatusDot tone={group.tone}>{group.label}</StatusDot>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
