// Display helpers for the admin views. Indonesian formatting throughout, since that is the
// language of the interface: months abbreviated as "Sep"/"Des", decimals with a comma.

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const NUMBER_FORMAT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export const EMPTY = "—";

/**
 * The API sends plain calendar days. Parsing them as UTC and formatting in UTC keeps the
 * day as written; letting the browser interpret them locally moves a deadline across a date
 * boundary for anyone west of Greenwich.
 */
export function formatDate(date: string | null): string {
  if (!date) return EMPTY;
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

/** "8 Jun – 25 Des 2026" when both ends share a year, the full dates otherwise. */
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
