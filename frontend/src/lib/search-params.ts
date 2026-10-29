// Reading a page's search parameters into checked values. Shared by every list page whose
// state lives in the URL (the admin Content Plan, Task Saya), so a hand-typed or stale address
// is read the same way everywhere: anything the page cannot hold falls back to its default
// rather than reaching an API that would only answer 400.

export type SearchParams = Record<string, string | string[] | undefined>;

/** A search parameter can arrive repeated; the first value is the one the UI set. */
export function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * A multi-select, trimmed and emptied of blanks. The UI writes it comma-separated; a link from
 * elsewhere may repeat the parameter instead, and every value of it counts.
 */
export function list(value: string | string[] | undefined): string[] {
  return [value ?? ""]
    .flat()
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function oneOf<T extends string>(values: readonly T[], raw: string, fallback: T): T {
  return (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** The values of a multi-select that are among the allowed ones, in the order given. */
export function listOf<T extends string>(values: readonly T[], value: string | string[] | undefined): T[] {
  return list(value).filter((part): part is T => (values as readonly string[]).includes(part));
}

/** A page number: a positive whole number, or the first page. */
export function pageNumber(value: string | string[] | undefined): number {
  const raw = single(value);
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` that names a day that exists, read the way the API reads it: 2026-02-31 rolls
 * over into March, so it fails the round trip. Empty for anything else.
 */
export function calendarDay(raw: string): string {
  if (!CALENDAR_DAY.test(raw)) return "";

  const parsed = new Date(`${raw}T00:00:00Z`);
  const exists = !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(raw);
  return exists ? raw : "";
}
