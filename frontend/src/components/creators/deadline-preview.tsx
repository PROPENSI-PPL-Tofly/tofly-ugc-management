interface DeadlinePreviewProps {
  autoDeadlines: string[];
  allocatedCount: number;
  remainingCount: number;
  quota: number;
}

export default function DeadlinePreview({ 
  autoDeadlines,
  allocatedCount,
  remainingCount,
  quota,
}: DeadlinePreviewProps) { // React component that displays a preview of deadlines, including automatic deadlines, allocation summary, and a monthly calendar view
  // Use the first deadline to determine which month to display.
  const firstDeadline = autoDeadlines[0]; // Get the first automatically generated deadline from the list of autoDeadlines
  const calendarDate = firstDeadline  
    ? new Date(`${firstDeadline}T00:00:00Z`) // Create a Date object for the first deadline in UTC format
    : null; // If there are no automatic deadlines, set calendarDate to null

  const year = calendarDate?.getUTCFullYear(); // Get the year of the first deadline in UTC format
  const month = calendarDate?.getUTCMonth(); // Get the month of the first deadline in UTC format 

  const monthTitle = calendarDate // Format the month and year of the first deadline for display in the calendar heading
    ? calendarDate.toLocaleDateString('en-US', { 
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null; // If there are no automatic deadlines, set monthTitle to null

  const daysInMonth = // Get the number of days in the month of the first deadline
    year !== undefined && month !== undefined // Check if year and month are defined
      ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate() // Create a Date object for the last day of the month and get the date (number of days in the month)
      : 0; // If year or month is undefined, set daysInMonth to 0

  // Number of empty cells before day 1.
  const firstDayOfWeek = // Get the day of the week for the first day of the month of the first deadline
    year !== undefined && month !== undefined // Check if year and month are defined
      ? new Date(Date.UTC(year, month, 1)).getUTCDay() // Create a Date object for the first day of the month and get the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      : 0; // If year or month is undefined, set firstDayOfWeek to 0

  // Makes checking whether a date is an auto deadline easier.
  const autoDeadlineSet = new Set(autoDeadlines); // Create a Set from the list of automatically generated deadlines for easier lookup when rendering the calendar

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
            {Array.from({ length: firstDayOfWeek }).map((_, index) => ( // Render empty cells for the days of the week before the first day of the month
              <span key={`empty-${index}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, index) => { // Render the days of the month in the calendar
              const day = index + 1; // Calculate the day of the month (1-based index)

              const date = `${year}-${String(month + 1).padStart( 
                2,
                '0',
              )}-${String(day).padStart(2, '0')}`;

              const isAutoDeadline = autoDeadlineSet.has(date);

              if (isAutoDeadline) { // If the current date is an automatically generated deadline, render it with a special test ID and data attribute for testing purposes
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