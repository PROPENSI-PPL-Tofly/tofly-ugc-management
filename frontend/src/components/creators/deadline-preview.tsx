'use client';

import { useState } from 'react';
import { getBufferWindow } from '@/lib/deadline-schedule';
import { formatDate } from '@/lib/format';
import { DeadlineSlot, SLOT_STYLES } from './deadline-slot';

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

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const MONTH_TITLE = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const NAV =
  'grid size-8 cursor-pointer place-items-center rounded-(--radius-control) border border-rule bg-surface text-base text-ink-2 transition-colors hover:border-ink-2 hover:text-ink';

/** What each colour on the calendar means, drawn with the same styles as the days themselves. */
const KEY: { label: string; style: string }[] = [
  { label: 'Deadline otomatis', style: SLOT_STYLES.auto },
  { label: 'Deadline manual', style: SLOT_STYLES.manual },
  { label: 'Masa buffer', style: SLOT_STYLES.buffer },
  { label: 'Di luar kontrak', style: SLOT_STYLES.outside },
];

function CalendarKey() {
  return (
    <ul aria-label="Keterangan kalender" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {KEY.map(({ label, style }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block size-3.5 rounded-[3px] p-0 ${style}`} />
          {label}
        </li>
      ))}
    </ul>
  );
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

  // The calendar heading as admins read it, e.g. "Oktober 2026".
  const monthTitle = calendarDate ? MONTH_TITLE.format(calendarDate) : null;

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

  // The number of weeks needed to display the month, first-day offset included.
  const weekCount = Math.ceil((firstDayOfWeek + daysInMonth) / 7);

  // Makes checking whether a date is an auto deadline easier.
  const autoDeadlineSet = new Set(autoDeadlines);

  const bufferWindow =
    contractStart && today && bufferDays !== undefined
      ? getBufferWindow({ contractStart, today, bufferDays })
      : null;
  const firstAllowed = bufferWindow?.firstAllowedDate.toISOString().slice(0, 10);

  return (
    <section aria-labelledby="deadline-preview-title" className="border-t border-rule pt-3">
      <h3 id="deadline-preview-title" className="text-[13px] font-bold text-ink">
        Preview Jadwal Deadline
      </h3>

      {firstAllowed ? (
        <p className="mt-1 text-xs text-muted">
          Deadline baru paling cepat {formatDate(firstAllowed)}, setelah masa buffer {bufferDays} hari.
        </p>
      ) : null}

      {calendarDate && year !== undefined && month !== undefined && (
        <div className="mt-3">
          {/* Calendar month and navigation */}
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">{monthTitle}</h4>

            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label="Bulan sebelumnya"
                onClick={() => setMonthOffset((current) => current - 1)}
                className={NAV}
              >
                <span aria-hidden="true">‹</span>
              </button>

              <button
                type="button"
                aria-label="Bulan berikutnya"
                onClick={() => setMonthOffset((current) => current + 1)}
                className={NAV}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>

          {/* Monthly deadline calendar */}
          <table
            aria-label={`Kalender deadline ${monthTitle}`}
            className="w-full table-fixed border-separate border-spacing-1 text-center"
          >
            <thead>
              <tr>
                {WEEKDAYS.map((weekday) => (
                  <th key={weekday} scope="col" className="py-1 text-xs font-semibold text-muted">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: weekCount }, (_, week) => (
                <tr key={week}>
                  {Array.from({ length: 7 }, (_, weekday) => {
                    const day = week * 7 + weekday - firstDayOfWeek + 1;

                    if (day < 1 || day > daysInMonth) {
                      return <td key={weekday} className="h-11" />;
                    }

                    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    const isAutoDeadline = autoDeadlineSet.has(date);

                    const currentDate = new Date(`${date}T00:00:00Z`);

                    const isBufferDate =
                      bufferWindow !== null &&
                      currentDate.getTime() >= bufferWindow.bufferStartDate.getTime() &&
                      currentDate.getTime() < bufferWindow.firstAllowedDate.getTime();

                    const isOutsideContract =
                      (contractStart !== undefined && date < contractStart) ||
                      (contractEnd !== undefined && date > contractEnd);

                    const manualCount = manualDeadlines.filter((picked) => picked === date).length;

                    // A manual pick has to land after the buffer and on or before the contract end.
                    const isPickable =
                      bufferWindow !== null &&
                      contractEnd !== undefined &&
                      currentDate.getTime() >= bufferWindow.firstAllowedDate.getTime() &&
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

          <CalendarKey />
        </div>
      )}

      {/* Required allocation progress */}
      <div className="mt-4 flex items-center gap-3">
        <span id="deadline-allocation-label" className="text-xs text-muted">
          Alokasi konten
        </span>
        <progress
          aria-labelledby="deadline-allocation-label"
          value={allocatedCount}
          max={Math.max(quota, 1)}
          className="progress h-1.5 min-w-0 flex-1"
        />
        <span className="text-[13px] font-semibold tabular-nums text-ink">
          {allocatedCount} / {quota} teralokasi
        </span>
      </div>
    </section>
  );
}
