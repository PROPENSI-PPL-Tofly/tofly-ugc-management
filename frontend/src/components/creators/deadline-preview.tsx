'use client';

import { useState } from 'react';
import { getBufferWindow } from '@/lib/deadline-schedule';
import { formatDate } from '@/lib/format';
import { DeadlineSlot } from './deadline-slot';

interface DeadlinePreviewProps {
  contractStart?: string;
  today?: string;
  bufferDays?: number;
  autoDeadlines: string[];
  allocatedCount: number;
  remainingCount: number;
  quota: number;
  /** The last day a deadline may fall on; manual picks stop here. */
  contractEnd?: string;
  /** Days the admin picked by hand, once per content. */
  manualDeadlines?: string[];
  /** Without the handlers the calendar is read-only. */
  onToggleAuto?: (day: string) => void;
  onAddManual?: (day: string) => void;
}

export default function DeadlinePreview({
  contractStart,
  today,
  bufferDays,
  autoDeadlines,
  allocatedCount,
  remainingCount,
  quota,
  contractEnd,
  manualDeadlines = [],
  onToggleAuto,
  onAddManual,
}: DeadlinePreviewProps) {
  // Start the calendar from the contract month, or use the first auto deadline as fallback.
  const calendarSourceDate = contractStart ?? autoDeadlines[0];

  // This is the starting month of the calendar.
  const baseCalendarDate = calendarSourceDate
    ? new Date(`${calendarSourceDate}T00:00:00Z`)
    : null;

  // Keep track of the displayed month's offset from the starting month.
  const [monthOffset, setMonthOffset] = useState(0);

  // Create the month currently being displayed.
  const calendarDate = baseCalendarDate
    ? new Date(
        Date.UTC(
          baseCalendarDate.getUTCFullYear(),
          baseCalendarDate.getUTCMonth() + monthOffset,
          1,
        ),
      )
    : null;

  const year = calendarDate?.getUTCFullYear();
  const month = calendarDate?.getUTCMonth();

  // Format the calendar heading, for example "September 2026".
  const monthTitle = calendarDate
    ? calendarDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  // Get the total number of days in the displayed month.
  const daysInMonth =
    year !== undefined && month !== undefined
      ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      : 0;

  // Get the weekday of the first day so the calendar lines up correctly.
  const firstDayOfWeek =
    year !== undefined && month !== undefined
      ? new Date(Date.UTC(year, month, 1)).getUTCDay()
      : 0;

  const weekCount = Math.ceil((firstDayOfWeek + daysInMonth) / 7); // Calculate the number of weeks needed to display the month, accounting for the first day offset and total days in the month.

  // Makes checking whether a date is an auto deadline easier.
  const autoDeadlineSet = new Set(autoDeadlines);

  const bufferWindow =
    contractStart && today && bufferDays !== undefined
      ? getBufferWindow({ contractStart, today, bufferDays })
      : null;

  return (
  <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6">
    <h3 className="mb-5 text-lg font-bold text-zinc-900">
      Preview Jadwal Deadline
    </h3>

    {calendarDate && year !== undefined && month !== undefined && (
      <div>
        {/* Calendar month and navigation */}
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-bold text-zinc-900">
            {monthTitle}
          </h4>

          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonthOffset((current) => current - 1)
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xl text-zinc-600 hover:bg-zinc-50"
            >
              ‹
            </button>

            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonthOffset((current) => current + 1)
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xl text-zinc-600 hover:bg-zinc-50"
            >
              ›
            </button>
          </div>
        </div>

        {/* Monthly deadline calendar */}
        <table
          aria-label={`Deadline calendar ${monthTitle}`}
          className="w-full table-fixed border-separate border-spacing-1 text-center"
        >
          <thead>
            <tr>
              {[
                'Min',
                'Sen',
                'Sel',
                'Rab',
                'Kam',
                'Jum',
                'Sab',
              ].map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  className="py-2 text-sm font-semibold text-zinc-500"
                >
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: weekCount }, (_, week) => (
              <tr key={week}>
                {Array.from({ length: 7 }, (_, weekday) => {
                  const day =
                    week * 7 +
                    weekday -
                    firstDayOfWeek +
                    1;

                  if (day < 1 || day > daysInMonth) {
                    return (
                      <td
                        key={weekday}
                        className="h-14"
                      />
                    );
                  }

                  const date = `${year}-${String(
                    month + 1,
                  ).padStart(2, '0')}-${String(day).padStart(
                    2,
                    '0',
                  )}`;

                  const isAutoDeadline =
                    autoDeadlineSet.has(date);

                  const currentDate = new Date(
                    `${date}T00:00:00Z`,
                  );

                  const isBufferDate =
                    bufferWindow !== null &&
                    currentDate.getTime() >=
                      bufferWindow.bufferStartDate.getTime() &&
                    currentDate.getTime() <
                      bufferWindow.firstAllowedDate.getTime();

                  const isOutsideContract =
                    (contractStart !== undefined && date < contractStart) ||
                    (contractEnd !== undefined && date > contractEnd);

                  const manualCount = manualDeadlines.filter(
                    (picked) => picked === date,
                  ).length;

                  // A manual pick has to land after the buffer and on or before the contract end.
                  const isPickable =
                    bufferWindow !== null &&
                    contractEnd !== undefined &&
                    currentDate.getTime() >=
                      bufferWindow.firstAllowedDate.getTime() &&
                    date <= contractEnd;

                  const label = formatDate(date);
                  let action: { label: string; onClick: () => void } | undefined;
                  if (onToggleAuto && isAutoDeadline) {
                    action = {
                      label: `${label}: lepas deadline otomatis`,
                      onClick: () => onToggleAuto(date),
                    };
                  } else if (onAddManual && isPickable && remainingCount > 0) {
                    action = {
                      label: `${label}: tambah deadline manual`,
                      onClick: () => onAddManual(date),
                    };
                  }

                  return (
                    <DeadlineSlot
                      key={weekday}
                      date={date}
                      day={day}
                      isAutoDeadline={isAutoDeadline}
                      isBufferDate={isBufferDate}
                      isOutsideContract={isOutsideContract}
                      manualCount={manualCount}
                      action={action}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* Required allocation progress */}
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs text-zinc-500">
        Alokasi konten
      </p>

      <p className="mt-1 font-semibold text-zinc-900">
        {allocatedCount} / {quota} teralokasi
      </p>
    </div>
  </section>
);
}
