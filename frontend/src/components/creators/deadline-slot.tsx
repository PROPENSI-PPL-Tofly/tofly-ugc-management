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
  return (
    <td className="h-14 p-0.5">
      <span>{day}</span>
    </td>
  );
}
