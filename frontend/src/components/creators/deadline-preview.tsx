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
  // Use the first auto deadline, or contract start if no auto deadline exists.
  const calendarSourceDate = autoDeadlines[0] ?? contractStart;

  // This is the starting month of the calendar.
  const baseCalendarDate = calendarSourceDate
    ? new Date(`${calendarSourceDate}T00:00:00Z`)
    : null;

  // Keep track of how many months the user moves forward.
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

            {/* Move the calendar forward by one month. */}
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthOffset((current) => current + 1)}
            >
              Next
            </button>
          </div>

          <div>
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          <div>
            {/* Add empty cells before the first day of the month. */}
            {Array.from({ length: firstDayOfWeek }).map((_, index) => (
              <span key={`empty-${index}`} />
            ))}

            {/* Render every date in the current month. */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;

              // Convert the calendar date into YYYY-MM-DD format.
              const date = `${year}-${String(month + 1).padStart(
                2,
                '0',
              )}-${String(day).padStart(2, '0')}`;

              const isAutoDeadline = autoDeadlineSet.has(date);
              const currentDate = new Date(`${date}T00:00:00Z`);

              // Check whether the date is still inside the buffer window.
              const isBufferDate =
                bufferStartDate !== null &&
                firstAllowedDate !== null &&
                currentDate.getTime() >= bufferStartDate.getTime() &&
                currentDate.getTime() < firstAllowedDate.getTime();

              // Mark dates that were generated automatically.
              if (isAutoDeadline) {
                return (
                  <span
                    key={date}
                    className="auto-deadline"
                    data-testid={`deadline-${date}`}
                    data-deadline-type="auto"
                  >
                    {day}
                  </span>
                );
              }

              // Mark dates that cannot be used because of the buffer.
              if (isBufferDate) {
                return (
                  <span
                    key={date}
                    className="buffer-date"
                    data-testid={`calendar-date-${date}`}
                    data-date-status="buffer"
                  >
                    {day}
                  </span>
                );
              }

              return <span key={date}>{day}</span>;
            })}
          </div>
        </div>
      )}

      <p>
        {allocatedCount} / {quota} allocated
      </p>

      <p>{remainingCount} remaining</p>
    </section>
  );
}