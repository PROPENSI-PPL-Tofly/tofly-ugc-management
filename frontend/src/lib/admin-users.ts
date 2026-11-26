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

/** The list's one address, shared by the page, its empty states and the menu. */
export const ADMIN_USERS_PATH = "/admin/users";

/** The API's query: the search and the page; the backend fixes ten rows a page itself. */
export function buildAdminUsersQuery(filters: AdminUserFilters, page: number): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  query.set("page", String(page));
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

/** The two admin roles the PBI introduces. */
export type AdminRole = "super_admin" | "admin";

/** Aktiv or Nonaktif, as the list's status column reads. */
export type AdminStatus = "active" | "inactive";

export interface AdminUser {
  id: string;
  /** Empty for an admin who signed in before PBI-23; the list then reads the email. */
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  /** The caller's own row, whose role and deactivation the screen shuts (23.4). */
  isSelf?: boolean;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
};

export const STATUS_LABELS: Record<AdminStatus, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
};

export function adminUserStatus(user: Pick<AdminUser, "isActive">): AdminStatus {
  return user.isActive ? "active" : "inactive";
}

/** The name a row is read by: the email when no name was ever set. */
export function adminUserDisplayName(user: Pick<AdminUser, "name" | "email">): string {
  return user.name.trim() || user.email;
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === "super_admin" || value === "admin";
}

function readAdminUser(raw: unknown): AdminUser {
  if (raw === null || typeof raw !== "object") {
    throw new Error("The admin list named no admin");
  }

  const row = raw as Record<string, unknown>;
  const { id, email, role, status, lastSignedInAt, createdAt } = row;

  if (typeof id !== "string" || id === "") {
    throw new Error("An admin row carried no id");
  }
  if (typeof email !== "string" || email === "") {
    throw new Error("An admin row carried no email");
  }
  if (!isAdminRole(role)) {
    throw new Error("An admin row carried an unknown role");
  }
  if (status !== "active" && status !== "inactive") {
    throw new Error("An admin row carried no status");
  }
  if (lastSignedInAt !== null && typeof lastSignedInAt !== "string") {
    throw new Error("An admin row carried an unreadable sign-in");
  }
  if (typeof createdAt !== "string") {
    throw new Error("An admin row carried no date added");
  }

  return {
    id,
    name: typeof row.name === "string" ? row.name : "",
    email,
    role,
    isActive: status === "active",
    lastSignInAt: lastSignedInAt,
    createdAt,
    ...(row.isSelf === true ? { isSelf: true } : {}),
  };
}

/**
 * The API's answer as the table's rows. A row with a field this screen cannot draw is refused
 * whole, rather than drawn half-read with an empty cell nobody can explain.
 */
export function toAdminUserList(raw: unknown): AdminUserListResponse {
  if (raw === null || typeof raw !== "object") {
    throw new Error("The admin list was not an answer");
  }

  const answer = raw as Record<string, unknown>;
  const { items, page, pageSize, total } = answer;

  if (!Array.isArray(items)) {
    throw new Error("The admin answer carried no list");
  }
  if (
    typeof page !== "number" ||
    typeof pageSize !== "number" ||
    pageSize <= 0 ||
    typeof total !== "number"
  ) {
    throw new Error("The admin answer carried no page");
  }

  return {
    items: items.map(readAdminUser),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
