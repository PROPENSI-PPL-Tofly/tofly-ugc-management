interface DeadlinePreviewProps {
  contractStart?: string;
  autoDeadlines: string[];
  allocatedCount: number;
  remainingCount: number;
  quota: number;
}

export default function DeadlinePreview({
  contractStart,
  autoDeadlines,
  allocatedCount,
  remainingCount,
  quota,
}: DeadlinePreviewProps) { // React component that displays a preview of deadlines, including automatic deadlines, allocation summary, and a monthly calendar view

  // Use the first auto deadline, or contract start if no auto deadline exists.
  const calendarSourceDate = autoDeadlines[0] ?? contractStart; 

  const calendarDate = calendarSourceDate
    ? new Date(`${calendarSourceDate}T00:00:00Z`) // Create a Date object in UTC format
    : null; // If there is no date available, set calendarDate to null

  const year = calendarDate?.getUTCFullYear(); // Get the year in UTC format
  const month = calendarDate?.getUTCMonth(); // Get the month in UTC format

  const monthTitle = calendarDate // Format the month and year for the calendar heading
    ? calendarDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null; // If there is no calendar date, set monthTitle to null

  const daysInMonth = // Get the number of days in the displayed month
    year !== undefined && month !== undefined
      ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      : 0;

  // Number of empty cells before day 1.
  const firstDayOfWeek =
    year !== undefined && month !== undefined
      ? new Date(Date.UTC(year, month, 1)).getUTCDay()
      : 0;

  // Makes checking whether a date is an auto deadline easier.
  const autoDeadlineSet = new Set(autoDeadlines);

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
          <h4>{monthTitle}</h4>

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
            {Array.from({ length: firstDayOfWeek }).map((_, index) => (
              <span key={`empty-${index}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;

              const date = `${year}-${String(month + 1).padStart(
                2,
                '0',
              )}-${String(day).padStart(2, '0')}`;

              const isAutoDeadline = autoDeadlineSet.has(date);

              if (isAutoDeadline) { // Mark automatically generated deadlines
                return (
                  <span
                    key={date}
                    data-testid={`deadline-${date}`}
                    data-deadline-type="auto"
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