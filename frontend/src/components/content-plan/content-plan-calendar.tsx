"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { StatusDot } from "@/components/ui/pill";
import { PHONE_TARGET } from "@/components/ui/touch-target";
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_TONES } from "@/lib/content-labels";
import {
  CONTENT_PLAN_FILTERED_EMPTY,
  contentPlanMonthHref,
  type ContentPlanParams,
  type ContentPlanRow,
} from "@/lib/content-plan";
import {
  OVERDUE_LABEL,
  PENDING_PROPOSAL_LABEL,
  calendarChipLabel,
  calendarChipTitle,
  isCalendarOverdue,
  isPendingProposal,
  shownMonth,
} from "@/lib/content-plan-calendar";
import type { ContentType } from "@/lib/contents";
import { formatDate } from "@/lib/format";
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
  type CalendarMonth,
} from "@/lib/task-calendar";

// A chip takes its content type's tone (CONTENT_TYPE_TONES), the wash-and-ink pairs the app's
// pills use: Specific in the accent, Evergreen neutral. Status never changes the colour.
const TONE_CHIPS = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-wash text-accent-deep",
} as const;

// On a phone a chip is only a dot in its type's colour.
const TONE_DOTS = {
  neutral: "bg-ink-2",
  accent: "bg-accent",
} as const;

const TYPES: readonly ContentType[] = ["evergreen", "specific"];

function chipTone(type: ContentType): string {
  return (
    TONE_CHIPS[CONTENT_TYPE_TONES[type] as keyof typeof TONE_CHIPS] ??
    TONE_CHIPS.neutral
  );
}

function dotTone(type: ContentType): string {
  return (
    TONE_DOTS[CONTENT_TYPE_TONES[type] as keyof typeof TONE_DOTS] ??
    TONE_DOTS.neutral
  );
}

// As Task Saya's chip: on a phone the press spans its whole day and is 44px tall, and the wash
// behind the dot is dropped, so the press grows and the mark does not.
const CHIP = `flex w-full cursor-pointer items-center gap-1 truncate rounded-(--radius-control) border-none px-1.5 py-0.5 text-left text-[11.5px] font-semibold ${PHONE_TARGET} max-sm:-mx-1.5 max-sm:w-auto max-sm:justify-center max-sm:bg-transparent`;

// A pending proposal is outlined in dashes, as the prototype draws it.
const PENDING = "outline-1 outline-dashed -outline-offset-1 outline-ink-2";

const NAV = `inline-flex cursor-pointer items-center rounded-(--radius-control) border border-rule bg-surface px-2 text-base leading-7 text-ink-2 hover:border-ink-2 ${PHONE_TARGET} max-sm:min-w-11 max-sm:justify-center`;

const DAYS_PER_WEEK = WEEKDAYS.length;

const MONTH_EMPTY = "Tidak ada konten di bulan ini.";

function OverdueDot() {
  return (
    <span
      aria-hidden="true"
      data-overdue-dot=""
      className="inline-block size-1.5 shrink-0 rounded-full bg-red ring-1 ring-surface"
    />
  );
}

/**
 * The Content Plan as a month (I3.6): every creator's content as a chip on its deadline day,
 * coloured by its type, with overdue and pending proposals marked apart so neither hides the
 * type. It shows the rows it is handed and reports the chip that was pressed; loading the month
 * and opening the detail panel are the page's and the board's. Turning the month is a link, so
 * the month lives in the address with the tab and filters.
 */
export function ContentPlanCalendar({
  items,
  month,
  today,
  state,
  filtered,
  onOpen,
}: Readonly<{
  items: readonly ContentPlanRow[];
  /** The month on show, already resolved from the address. */
  month: CalendarMonth;
  /** Today's calendar day in Jakarta, "YYYY-MM-DD", read once by the server. */
  today: string;
  /** The tab, search and filters in effect, carried into every month link. */
  state: ContentPlanParams;
  /** Whether a search or filter narrowed the plan, which changes what an empty month says. */
  filtered: boolean;
  /** Called with the content id of the chip that was pressed. */
  onOpen: (contentId: string) => void;
}>) {
  const current = shownMonth("", today);
  const isCurrent =
    month.year === current.year && month.month === current.month;
  const cells = monthGrid(month, items, today);
  const weeks = Array.from(
    { length: cells.length / DAYS_PER_WEEK },
    (_, week) => cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  // The month's content in date order: the grid walks its days from the 1st, and a deadline that
  // is not a day of this month (or not a day at all) never lands on one.
  const monthItems = cells.flatMap((cell) => cell?.tasks ?? []);
  const empty = filtered ? CONTENT_PLAN_FILTERED_EMPTY : MONTH_EMPTY;

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {isCurrent ? (
          <Button disabled>Hari Ini</Button>
        ) : (
          <Link
            href={contentPlanMonthHref(state, null)}
            className={buttonClasses()}
          >
            Hari Ini
          </Link>
        )}
        <Link
          href={contentPlanMonthHref(state, shiftMonth(month, -1))}
          aria-label="Bulan Sebelumnya"
          className={NAV}
        >
          ‹
        </Link>
        <Link
          href={contentPlanMonthHref(state, shiftMonth(month, 1))}
          aria-label="Bulan Berikutnya"
          className={NAV}
        >
          ›
        </Link>
        <h3 className="text-[15px]">{monthLabel(month)}</h3>
      </div>

      {monthItems.length === 0 ? (
        <p role="status" className="mb-3 text-xs text-muted">
          {empty}
        </p>
      ) : null}

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Content Plan {monthLabel(month)}</caption>
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
                  <td
                    key={column}
                    className="border border-rule bg-surface-2"
                  />
                ) : (
                  <td
                    key={cell.day}
                    data-day={cell.day}
                    aria-current={cell.isToday ? "date" : undefined}
                    className="h-24 border border-rule p-1.5 align-top"
                  >
                    {/* Today's date sits in a solid accent pill, as the prototype marks it, so a
                        Specific chip's accent wash never blends into the day behind it. */}
                    <p className="mb-1 text-xs">
                      <span
                        className={
                          cell.isToday
                            ? "inline-block rounded-full bg-accent px-1.5 font-bold text-accent-ink"
                            : "text-muted"
                        }
                      >
                        {cell.date}
                      </span>
                    </p>
                    <div className="flex flex-col gap-1">
                      {cell.tasks.map((row) => {
                        const overdue = isCalendarOverdue(row);
                        const pending = isPendingProposal(row);
                        const title = calendarChipTitle(row);
                        return (
                          <button
                            key={row.contentId}
                            type="button"
                            data-type={row.type}
                            data-overdue={overdue ? "true" : undefined}
                            data-pending={pending ? "true" : undefined}
                            aria-label={title}
                            title={title}
                            onClick={() => onOpen(row.contentId)}
                            className={`${CHIP} ${chipTone(row.type)} ${pending ? PENDING : ""}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`block size-2 shrink-0 rounded-full sm:hidden ${dotTone(row.type)} ${overdue ? "ring-2 ring-red" : ""}`}
                            />
                            {overdue ? (
                              <span className="max-sm:hidden">
                                <OverdueDot />
                              </span>
                            ) : null}
                            <span className="sr-only truncate sm:not-sr-only">
                              {calendarChipLabel(row)}
                            </span>
                          </button>
                        );
                      })}
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
        {TYPES.map((type) => (
          <li key={type}>
            <StatusDot tone={CONTENT_TYPE_TONES[type]}>
              {CONTENT_TYPE_LABELS[type]}
            </StatusDot>
          </li>
        ))}
        <li>
          <StatusDot tone="red">{OVERDUE_LABEL}</StatusDot>
        </li>
        <li>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink-2">
            <span
              aria-hidden="true"
              className="h-2 w-3 rounded-xs outline-1 outline-dashed outline-ink-2"
            />
            {PENDING_PROPOSAL_LABEL}
          </span>
        </li>
        <li>
          <StatusDot tone="accent">Hari Ini</StatusDot>
        </li>
      </ul>

      {/* The month's list is for small screens: the grid shows where the deadlines fall, this
          says what they are and whose. */}
      <section aria-label="Konten bulan ini" className="mt-4 sm:hidden">
        <h4 className="mb-2 text-xs font-semibold text-muted">
          Konten bulan ini
        </h4>
        {monthItems.length === 0 ? (
          <p className="text-xs text-muted">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {monthItems.map((row) => (
              <li key={row.contentId}>
                <button
                  type="button"
                  data-content={row.contentId}
                  onClick={() => onOpen(row.contentId)}
                  className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-left hover:border-ink-2 ${isPendingProposal(row) ? "border-dashed" : ""}`}
                >
                  <span className="text-[11.5px] text-muted">
                    {formatDate(row.deadline)}
                  </span>
                  <span className="wrap-anywhere text-[13px] font-semibold text-ink">
                    {row.name}
                  </span>
                  <span className="text-[11.5px] text-ink-2">
                    {row.creatorName}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-[11.5px] text-muted">
                    <StatusDot tone={CONTENT_TYPE_TONES[row.type] ?? "neutral"}>
                      {CONTENT_TYPE_LABELS[row.type] ?? row.type}
                    </StatusDot>
                    {isCalendarOverdue(row) ? (
                      <StatusDot tone="red">{OVERDUE_LABEL}</StatusDot>
                    ) : null}
                    {isPendingProposal(row) ? (
                      <span className="text-xs font-semibold text-ink-2">
                        {PENDING_PROPOSAL_LABEL}
                      </span>
                    ) : null}
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
