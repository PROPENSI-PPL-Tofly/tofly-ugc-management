// The Pengguna Admin list's shared vocabulary (PBI-23, 23.3): what its address holds, how its
// query reaches the API, and how an answer becomes the rows the table draws. Plain module, so
// the page, the table and the tests read the same words.

import { single, type SearchParams } from "./search-params";

/** The only filter the list has: one search over name and email. */
export interface AdminUserFilters {
  q: string;
}

/**
 * The page number, and whatever the address said instead when it is not one, so the page can
 * name it rather than silently show another list.
 */
export function parseAdminUserPage(params: SearchParams): {
  page: number;
  invalid: string | null;
} {
  const raw = single(params.page);
  if (raw === "") {
    return { page: 1, invalid: null };
  }

  return /^[1-9]\d*$/.test(raw)
    ? { page: Number(raw), invalid: null }
    : { page: 1, invalid: raw };
}

/** The search, trimmed; anything else the address carries is not this list's state. */
export function parseAdminUserFilters(params: SearchParams): AdminUserFilters {
  return { q: single(params.q).trim() };
}

/** Ten rows a page, the PBI's own count. */
export const ADMIN_USERS_PAGE_SIZE = 10;

/** The API's query: its own `search` name, the page, and the fixed page size. */
export function buildAdminUsersQuery(filters: AdminUserFilters, page: number): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("search", filters.q);
  query.set("page", String(page));
  query.set("pageSize", String(ADMIN_USERS_PAGE_SIZE));
  return query.toString();
}

/**
 * The page's own address, for its page links and its retry: the app's `q`, the page only when
 * it is not the first, and no defaults.
 */
export function adminUserQuery(
  filters: AdminUserFilters,
  page: number,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.q) query.q = filters.q;
  if (page > 1) query.page = String(page);
  return query;
}
