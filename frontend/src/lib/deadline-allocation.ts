// Pure rules for the Add Creator schedule once the admin adjusts it by hand: which auto
// deadlines they took off the calendar, which days they picked themselves, and what that
// leaves to send. The picks are kept separate from the auto schedule so a change to the
// contract re-derives everything instead of carrying stale dates along.

/** What the admin changed on the calendar. ISO calendar days (`YYYY-MM-DD`). */
export interface SlotPicks {
  removedAuto: string[];
  /** One entry per content; the same day may appear more than once. */
  manual: string[];
}

export const NO_PICKS: SlotPicks = { removedAuto: [], manual: [] };

/** The contract as the schedule sees it: where deadlines may go and how many are needed. */
export interface ScheduleBounds {
  autoDeadlines: string[];
  quota: number;
  /** The first day after the buffer; nothing earlier is accepted. */
  firstAllowed: string;
  contractEnd: string;
}

export interface Allocation {
  auto: string[];
  manual: string[];
  /** Every deadline to send, auto and manual together, in date order. */
  deadlines: string[];
  /** Contents that still have no deadline. */
  remaining: number;
}

export function allocateDeadlines(bounds: ScheduleBounds, picks: SlotPicks): Allocation {
  const auto = bounds.autoDeadlines.filter((day) => !picks.removedAuto.includes(day));
  const open = Math.max(0, bounds.quota - auto.length);
  const manual = picks.manual
    .filter((day) => day >= bounds.firstAllowed && day <= bounds.contractEnd)
    .slice(0, open);

  return {
    auto,
    manual,
    deadlines: [...auto, ...manual].sort((a, b) => a.localeCompare(b)),
    remaining: open - manual.length,
  };
}

/** Takes an auto deadline off the calendar, or puts it back. */
export function toggleAutoDeadline(picks: SlotPicks, day: string): SlotPicks {
  const removedAuto = picks.removedAuto.includes(day)
    ? picks.removedAuto.filter((removed) => removed !== day)
    : [...picks.removedAuto, day];
  return { ...picks, removedAuto };
}

/** Gives one more content this day, as long as some content still has no deadline. */
export function addManualDeadline(picks: SlotPicks, day: string, remaining: number): SlotPicks {
  return remaining > 0 ? { ...picks, manual: [...picks.manual, day] } : picks;
}

/** Takes one content off this day; any others on the same day stay. */
export function removeManualDeadline(picks: SlotPicks, day: string): SlotPicks {
  const index = picks.manual.lastIndexOf(day);
  return { ...picks, manual: picks.manual.filter((_, position) => position !== index) };
}
