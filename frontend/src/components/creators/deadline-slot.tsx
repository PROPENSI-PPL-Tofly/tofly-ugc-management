"use client";

interface DeadlineSlotProps {
  date: string;
  day: number;
  isAutoDeadline: boolean;
  isBufferDate: boolean;
}

export function DeadlineSlot({
  date,
  day,
  isAutoDeadline,
  isBufferDate,
}: DeadlineSlotProps) {
  if (isAutoDeadline) {
    return (
      <td className="h-14 p-0.5">
        <span
          className="auto-deadline flex h-full min-h-12 items-start justify-start rounded-lg p-2 text-sm font-bold text-white"
          data-testid={`deadline-${date}`}
          data-deadline-type="auto"
        >
          {day}
        </span>
      </td>
    );
  }

  if (isBufferDate) {
    return (
      <td className="h-14 p-0.5">
        <span
          className="buffer-date flex h-full min-h-12 items-start justify-start rounded-lg p-2 text-sm"
          data-testid={`calendar-date-${date}`}
          data-date-status="buffer"
        >
          {day}
        </span>
      </td>
    );
  }

  return (
    <td className="h-14 p-0.5">
      <span className="flex h-full min-h-12 items-start justify-start rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-600">
        {day}
      </span>
    </td>
  );
}
