"use client";

interface DeadlineSlotProps {
  date: string;
  day: number;
  isAutoDeadline: boolean;
  isBufferDate: boolean;
  onAssign: (date: string) => void;
}

export function DeadlineSlot({
  date,
  day,
  isAutoDeadline,
  isBufferDate,
  onAssign,
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
      <button
        type="button"
        onClick={() => onAssign(date)}
        className="flex h-full min-h-12 w-full items-start justify-start rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-600 hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
        data-testid={`slot-${date}`}
      >
        {day}
      </button>
    </td>
  );
}
