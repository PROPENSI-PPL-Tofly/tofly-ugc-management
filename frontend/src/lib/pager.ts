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
 * Stub until paging lands: every row on one page whatever is asked, so the tests that pin the
 * paging run and fail on what is missing.
 */
export function pageOf<T>(items: readonly T[], page: number, size: number): PageView<T> {
  void page;
  void size;
  return { rows: [...items], page: 0, pages: 1, first: items.length > 0 ? 1 : 0, last: items.length, total: items.length };
}
