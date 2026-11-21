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
