"use client";

interface DeadlineSlotProps {
  date: string;
  day: number;
  isAutoDeadline: boolean;
  isBufferDate: boolean;
  /** Before the contract starts or after it ends: no deadline can land here. */
  isOutsideContract?: boolean;
  /** How many contents the admin placed on this day by hand. */
  manualCount?: number;
  /** Makes the day a button; the label says what a click does to this date. */
  action?: { label: string; onClick: () => void };
}

const CELL =
  "flex h-full min-h-10 w-full items-start justify-start rounded-(--radius-control) p-1.5 text-[13px] tabular-nums";

/**
 * How each kind of day looks. Shared with the calendar's key so the key can never drift from
 * the days it explains. Colour is never the only signal: each non-plain day also carries a word
 * for screen readers, and outside days are struck through.
 */
export const SLOT_STYLES = {
  auto: "auto-deadline font-bold",
  manual: "border border-accent bg-accent-wash font-bold text-accent-deep",
  buffer: "border border-dashed border-amber bg-amber-wash text-amber-ink",
  outside: "bg-surface-2 text-muted line-through",
  plain: "border border-rule-2 bg-surface text-ink-2",
} as const;

function SlotContent({
  date,
  day,
  isAutoDeadline,
  isBufferDate,
  isOutsideContract = false,
  manualCount = 0,
}: Omit<DeadlineSlotProps, "action">) {
  if (isAutoDeadline) {
    return (
      <span
        className={`${CELL} ${SLOT_STYLES.auto}`}
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
        className={`${CELL} ${SLOT_STYLES.manual}`}
        data-testid={`deadline-${date}`}
        data-deadline-type="manual"
      >
        {day}
        {manualCount > 1 ? <span className="ml-auto text-xs">×{manualCount}</span> : null}
      </span>
    );
  }

  if (isOutsideContract) {
    return (
      <span
        className={`${CELL} ${SLOT_STYLES.outside}`}
        data-testid={`calendar-date-${date}`}
        data-date-status="outside"
      >
        {day}
        <span className="sr-only"> di luar kontrak</span>
      </span>
    );
  }

  if (isBufferDate) {
    return (
      <span
        className={`buffer-date ${CELL} ${SLOT_STYLES.buffer}`}
        data-testid={`calendar-date-${date}`}
        data-date-status="buffer"
      >
        {day}
        <span className="sr-only"> masa buffer</span>
      </span>
    );
  }

  return <span className={`${CELL} ${SLOT_STYLES.plain}`}>{day}</span>;
}

export function DeadlineSlot({ action, ...slot }: DeadlineSlotProps) {
  return (
    <td className="h-11 p-0">
      {action ? (
        <button
          type="button"
          aria-label={action.label}
          onClick={action.onClick}
          className="block h-full w-full cursor-pointer rounded-(--radius-control) transition-colors [&>span]:hover:border-accent"
        >
          <SlotContent {...slot} />
        </button>
      ) : (
        <SlotContent {...slot} />
      )}
    </td>
  );
}
