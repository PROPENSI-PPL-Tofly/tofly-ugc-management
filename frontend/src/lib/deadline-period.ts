// The named deadline periods every list's filter bar offers ("Bulan ini", "30 hari ke depan"),
// turned into the two days the list APIs read. Shared by the admin Content Plan and Task Saya,
// so the same name always covers the same days on both.
//
// Pure module with no clock of its own: callers pass "today" (Jakarta time), so tests pin it.

export type PeriodFilter = "all" | "month" | "next30" | "last90" | "custom";

/** A period as the URL holds it: a name, plus the two days of a custom range. */
export interface PeriodState {
  period: PeriodFilter;
  from: string;
  to: string;
}

const MS_PER_DAY = 86_400_000;

/** A calendar day moved by a number of days, counted in UTC so no timezone can shift it. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The first and the last day of the month a day falls in. */
function monthOf(day: string): [string, string] {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // Day zero of the next month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return [`${day.slice(0, 8)}01`, last];
}

/**
 * The two ends of the deadline range a period stands for; an empty end is left open. A custom
 * range picked backwards is put in order, since the APIs refuse a start after its end.
 */
export function periodRange(state: PeriodState, today: string): [string, string] {
  switch (state.period) {
    case "month":
      return monthOf(today);
    case "next30":
      return [today, shiftDay(today, 30)];
    case "last90":
      return [shiftDay(today, -90), today];
    case "custom":
      return state.from && state.to && state.from > state.to
        ? [state.to, state.from]
        : [state.from, state.to];
    default:
      return ["", ""];
  }
}
