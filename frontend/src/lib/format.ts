// Display helpers for the admin views. Indonesian formatting throughout, since that is the
// language of the interface: months abbreviated as "Sep" / "Des", decimals with a comma.

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const NUMBER_FORMAT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

// Moments (as opposed to calendar days) are shown in Jakarta time, where Tofly works. Day
// and time are formatted apart and joined here: the combined pattern's joiner comes from the
// browser's locale data, and some browsers write ", pukul" instead of ", ".
const JAKARTA = "Asia/Jakarta";

const JAKARTA_DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: JAKARTA,
});

const JAKARTA_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: JAKARTA,
});

export const EMPTY = "—";

/**
 * The API sends plain calendar days. Parsing and formatting them as UTC keeps the day as
 * written; letting the browser read them in local time moves a date across midnight for
 * anyone west of Greenwich.
 */
export function formatDate(date: string | null): string {
  if (!date) return EMPTY;
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

/**
 * "20 Sep 2026, 10.00 WIB" for an ISO timestamp such as submissions.created_at. Unlike
 * formatDate, the day is Jakarta's: a draft sent at 01.30 WIB is 18.30 UTC the day before.
 */
export function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return EMPTY;

  const moment = new Date(timestamp);
  if (Number.isNaN(moment.getTime())) return EMPTY;

  return `${JAKARTA_DAY_FORMAT.format(moment)}, ${JAKARTA_TIME_FORMAT.format(moment)} WIB`;
}

/** "10 Jun – 7 Des 2026" when both ends share a year, both full dates otherwise. */
export function formatContractWindow(start: string | null, end: string | null): string {
  if (!start || !end) return "Belum ada kontrak";

  const from = formatDate(start);
  const to = formatDate(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);

  return sameYear ? `${from.slice(0, -5)} – ${to}` : `${from} – ${to}`;
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return EMPTY;
  if (days === 0) return "berakhir hari ini";
  if (days < 0) return `berakhir ${Math.abs(days)} hari lalu`;
  return `sisa ${days} hari`;
}

export function formatPercent(value: number | null): string {
  return value === null ? EMPTY : `${value}%`;
}

export function formatRevisions(value: number): string {
  return `${NUMBER_FORMAT.format(value)}x`;
}
