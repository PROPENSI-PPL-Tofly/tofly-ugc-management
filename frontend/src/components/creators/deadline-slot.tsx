"use client";

interface DeadlineSlotProps {
  date: string;
  day: number;
  isAutoDeadline: boolean;
  isBufferDate: boolean;
  /** How many contents the admin placed on this day by hand. */
  manualCount?: number;
  /** Makes the day a button; the label says what a click does to this date. */
  action?: { label: string; onClick: () => void };
}

const CELL = "flex h-full min-h-12 w-full items-start justify-start rounded-lg p-2 text-sm";

function SlotContent({
  date,
  day,
  isAutoDeadline,
  isBufferDate,
  manualCount = 0,
}: Omit<DeadlineSlotProps, "action">) {
  if (isAutoDeadline) {
    return (
      <span
        className={`auto-deadline ${CELL} font-bold`}
        data-testid={`deadline-${date}`}
        data-deadline-type="auto"
      >
        {day}
      </span>
    );
  }

  if (manualCount > 0) {
    return (
      <span
        className={`${CELL} border border-accent bg-accent-wash font-bold text-accent-deep`}
        data-testid={`deadline-${date}`}
        data-deadline-type="manual"
      >
        {day}
        {manualCount > 1 ? <span className="ml-auto text-xs">×{manualCount}</span> : null}
      </span>
    );
  }

  if (isBufferDate) {
    return (
      <span
        className={`buffer-date ${CELL}`}
        data-testid={`calendar-date-${date}`}
        data-date-status="buffer"
      >
        {day}
      </span>
    );
  }

  return (
    <span className={`${CELL} border border-zinc-200 bg-white text-zinc-600`}>{day}</span>
  );
}

export function DeadlineSlot({ action, ...slot }: DeadlineSlotProps) {
  return (
    <td className="h-14 p-0.5">
      {action ? (
        <button
          type="button"
          aria-label={action.label}
          onClick={action.onClick}
          className="block h-full w-full cursor-pointer rounded-lg transition-opacity hover:opacity-80"
        >
          <SlotContent {...slot} />
        </button>
      ) : (
        <SlotContent {...slot} />
      )}
    </td>
  );
}
