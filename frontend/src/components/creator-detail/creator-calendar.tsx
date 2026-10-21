"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS } from "@/lib/content-labels";
import { statusInTab } from "@/lib/content-plan";
import {
  CREATOR_CALENDAR_GROUPS,
  creatorCalendarGroup,
  isInPeriod,
  periodMonths,
  type CreatorCalendarGroup,
  type CreatorCalendarGroupDef,
} from "@/lib/creator-calendar";
import {
  DEFAULT_CREATOR_DETAIL_PARAMS,
  type CreatorContentRow,
  type CreatorDetailParams,
  type CreatorPeriod,
} from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";
import {
  calendarChipLabel,
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
  type CalendarMonth,
} from "@/lib/task-calendar";

const CHIP_TONES: Record<CreatorCalendarGroup, string> = {
  action: "bg-amber-wash text-amber-ink",
  waiting: "bg-surface-2 text-ink-2",
  done: "bg-green-wash text-green-ink",
  overdue: "bg-red-wash text-red-ink",
};

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

function spoken(entry: CreatorContentRow): string {
  return `${entry.name} · ${CONTENT_STATUS_LABELS[entry.status]}`;
}

function filterEntries(entries: readonly CreatorContentRow[], state: CreatorDetailParams) {
  const query = state.q.toLocaleLowerCase();
  return entries.filter((entry) => {
    if (query && !entry.name.toLocaleLowerCase().includes(query)) return false;
    if (state.type.length && !state.type.includes(entry.type)) return false;
    if (state.status.length && !state.status.includes(entry.status)) return false;
    if (state.overdue === "yes" && !entry.tags.includes("overdue")) return false;
    if (state.overdue === "no" && entry.tags.includes("overdue")) return false;
    return statusInTab(state.tab, entry.status);
  });
}

export function CreatorCalendar({
  period,
  entries,
  today,
  onOpen,
  state = DEFAULT_CREATOR_DETAIL_PARAMS,
}: Readonly<{
  period: CreatorPeriod;
  entries: readonly CreatorContentRow[];
  today: string;
  onOpen: (contentId: string) => void;
  state?: CreatorDetailParams;
}>) {
  const { first, last, opening } = periodMonths(period, today);
  const [shown, setShown] = useState<CalendarMonth>(opening);
  const todayInPeriod = isInPeriod(today, period);
  const visibleEntries = filterEntries(entries, state);
  const cells = monthGrid(shown, visibleEntries, today);
  const weeks = Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  const monthEntries = cells.flatMap((cell) => cell?.tasks ?? []);

  return (
    <Panel>
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[15px]">Jadwal Konten</h2>
      </div>
      <div className="px-5 pb-5">
        {period.remainingEvergreenQuota > 0 ? (
          <p role="note" className="mb-3 rounded-(--radius-control) border border-amber bg-amber-wash px-3 py-2 text-xs text-amber-ink">
            {period.remainingEvergreenQuota} slot Evergreen belum dialokasikan.
          </p>
        ) : null}
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
          {!todayInPeriod ? <p className="text-xs text-muted">Hari ini di luar periode ini.</p> : null}
        </div>

        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Jadwal konten {monthLabel(shown)}</caption>
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
                  const tone = cell.isToday ? "bg-accent-wash" : outside ? "bg-surface-2" : "";
                  return (
                    <td
                      key={cell.day}
                      data-day={cell.day}
                      data-outside={outside ? "true" : undefined}
                      aria-current={cell.isToday ? "date" : undefined}
                      className={`h-20 border border-rule p-1.5 align-top ${tone}`}
                    >
                      <p className={`mb-1 text-xs ${cell.isToday ? "font-bold text-accent-deep" : "text-muted"} ${outside ? "opacity-60" : ""}`}>
                        {cell.date}{outside ? <span className="sr-only">di luar periode</span> : null}
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
                              <span aria-hidden="true" className={`mx-auto block size-2 rounded-full sm:hidden ${DOT_TONES[group]}`} />
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
            <li key={group.key}><StatusDot tone={group.tone}>{group.label}</StatusDot></li>
          ))}
          <li><StatusDot tone="accent">Hari Ini</StatusDot></li>
        </ul>

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
                      <span className="text-[11.5px] text-muted"><StatusDot tone={group.tone}>{group.label}</StatusDot></span>
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
