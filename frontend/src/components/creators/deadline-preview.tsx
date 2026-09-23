'use client';

import { useState } from 'react';

interface DeadlinePreviewProps {
  contractStart?: string;
  today?: string;
  bufferDays?: number;
  autoDeadlines: string[];
  allocatedCount: number;
  remainingCount: number;
  quota: number;
}

export default function DeadlinePreview({
  contractStart,
  today,
  bufferDays,
  autoDeadlines,
  allocatedCount,
  remainingCount,
  quota,
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

  // Buffer starts from contract start or today, whichever is later.
  const bufferStartDate =
    contractStart && today
      ? new Date(
          `${contractStart > today ? contractStart : today}T00:00:00Z`,
        )
      : null;

  // Calculate the first date that is allowed after the buffer.
  const firstAllowedDate =
    bufferStartDate && bufferDays !== undefined
      ? new Date(bufferStartDate)
      : null;

  if (firstAllowedDate && bufferDays !== undefined) {
    firstAllowedDate.setUTCDate(
      firstAllowedDate.getUTCDate() + bufferDays,
    );
  }

  return (
    <section>
      <h3>Deadline Preview</h3>

      <div>
        {autoDeadlines.map((deadline) => (
          <div key={deadline}>
            <span>{deadline}</span>
            <span>Auto</span>
          </div>
        ))}
      </div>

      {calendarDate && year !== undefined && month !== undefined && (
        <div>
          <div>
            <h4>{monthTitle}</h4>

            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthOffset((current) => current - 1)}
            >
              Previous
            </button>

            {/* Move the calendar forward by one month. */}
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthOffset((current) => current + 1)}
            >
              Next
            </button>
          </div>

          <table
            aria-label={`Deadline calendar ${monthTitle}`}
            className="w-full table-fixed border-separate border-spacing-1 text-center"
          >
            <thead>
              <tr>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
                  <th key={weekday} scope="col" className="py-2 text-sm font-medium">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weekCount }, (_, week) => ( // Iterate through each week in the month
                <tr key={week}> 
                  {Array.from({ length: 7 }, (_, weekday) => { // Iterate through each day of the week
                    const day = week * 7 + weekday - firstDayOfWeek + 1; // Calculate the day of the month for the current cell in the calendar

                    if (day < 1 || day > daysInMonth) { // If the calculated day is outside the valid range for the month, render an empty cell
                      return <td key={weekday} className="h-10" />;
                    }

                    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isAutoDeadline = autoDeadlineSet.has(date);
                    const currentDate = new Date(`${date}T00:00:00Z`);
                    const isBufferDate =
                      bufferStartDate !== null &&
                      firstAllowedDate !== null &&
                      currentDate.getTime() >= bufferStartDate.getTime() &&
                      currentDate.getTime() < firstAllowedDate.getTime();

                    return (
                      <td key={weekday} className="h-10 text-sm">
                        {isAutoDeadline ? (
                          <span
                            className="auto-deadline"
                            data-testid={`deadline-${date}`}
                            data-deadline-type="auto"
                          >
                            {day}
                          </span>
                        ) : isBufferDate ? (
                          <span
                            className="buffer-date"
                            data-testid={`calendar-date-${date}`}
                            data-date-status="buffer"
                          >
                            {day}
                          </span>
                        ) : <span>{day}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p>
        {allocatedCount} / {quota} allocated
      </p>

      <p>{remainingCount} remaining</p>
    </section>
  );
}
