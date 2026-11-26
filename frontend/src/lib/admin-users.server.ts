// Server-side only: the Pengguna Admin list, fetched while the page renders. It reads the
// browser's session through next/headers, which client components cannot import, so it lives
// apart from the shared admin module.

import {
  buildAdminUsersQuery,
  toAdminUserList,
  type AdminUserFilters,
  type AdminUserListResponse,
} from "./admin-users";
import { appSessionCookieHeader } from "./session-cookie";

/** What a page can do with the list: draw it, say not found, or offer a retry. */
export type AdminUsersOutcome =
  | { kind: "loaded"; list: AdminUserListResponse }
  | { kind: "refused" }
  | { kind: "unavailable" };

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The list, as the backend answers it with the browser's session. A 403 is the backend keeping
 * the Super Admin rule even when this app's role check has gone stale: the page reads it as not
 * found. Anything else that did not arrive is unavailable, never an empty list.
 */
export async function fetchAdminUsers(
  page: number,
  filters: AdminUserFilters,
): Promise<AdminUsersOutcome> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return { kind: "unavailable" };
  }

  const query = buildAdminUsersQuery(filters, page);
  const cookie = await appSessionCookieHeader();

  let response: Response;
  try {
    response = await fetch(`${withoutTrailingSlash(backendUrl)}/admin/users?${query}`, {
      cache: "no-store",
      ...(cookie && { headers: { cookie } }),
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (response.status === 403) {
    return { kind: "refused" };
  }
  if (!response.ok) {
    return { kind: "unavailable" };
  }

  try {
    return { kind: "loaded", list: toAdminUserList(await response.json()) };
  } catch {
    return { kind: "unavailable" };
  }
}
