import type { AdminUser, AdminUserListResponse } from "@/lib/admin-users";

/** One row as the API sends it, with the fields a test is not about left at their usual value. */
export function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "7d9f3d1a-0000-4000-8000-000000000001",
    name: "Rangga Pratama",
    email: "rangga@example.com",
    role: "admin",
    isActive: true,
    lastSignInAt: "2026-11-10T03:00:00.000Z",
    createdAt: "2026-10-01T02:00:00.000Z",
    ...overrides,
  };
}

/** A list answer, its count and pages read off the items unless a test says otherwise. */
export function listResponse(
  overrides: Partial<AdminUserListResponse> = {},
): AdminUserListResponse {
  const items = overrides.items ?? [adminUser()];
  const pageSize = overrides.pageSize ?? 10;
  const total = overrides.total ?? items.length;

  return {
    items,
    page: 1,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    ...overrides,
  };
}
