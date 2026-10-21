/** One page of a list the page already holds in full. */
export interface PageView<T> {
  rows: T[];
  /** Which page, counted from 0. */
  page: number;
  pages: number;
  /** The first and last rows shown, counted from 1; both 0 for an empty list. */
  first: number;
  last: number;
  total: number;
}

/**
 * The rows of one page. The page asked for is held inside the list (a list that shrank, or a
 * screen that widened to fewer pages, lands on its last page rather than on nothing), and a
 * page size under one shows one row at a time. An empty list is one empty page.
 */
export function pageOf<T>(items: readonly T[], page: number, size: number): PageView<T> {
  const perPage = Math.max(1, Math.floor(size));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = current * perPage;
  const rows = items.slice(start, start + perPage);

  return {
    rows,
    page: current,
    pages,
    first: rows.length > 0 ? start + 1 : 0,
    last: start + rows.length,
    total,
  };
}
