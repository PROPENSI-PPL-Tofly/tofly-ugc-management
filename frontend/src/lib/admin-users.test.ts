import {
  ADMIN_USERS_PAGE_SIZE,
  ROLE_LABELS,
  STATUS_LABELS,
  adminUserDisplayName,
  adminUserQuery,
  adminUserStatus,
  buildAdminUsersQuery,
  parseAdminUserFilters,
  parseAdminUserPage,
  toAdminUserList,
} from "./admin-users";

describe("the admin list's address", () => {
  it("starts on the first page with no search when the address is bare", () => {
    expect(parseAdminUserPage({})).toEqual({ page: 1, invalid: null });
    expect(parseAdminUserFilters({})).toEqual({ q: "" });
  });

  it("reads the page and trims the search", () => {
    expect(parseAdminUserPage({ page: "3" })).toEqual({ page: 3, invalid: null });
    expect(parseAdminUserFilters({ q: "  rangga  " })).toEqual({ q: "rangga" });
  });

  // A repeated parameter is a link someone edited by hand: the first value is the one the UI set.
  it("reads the first value when the address repeats a parameter", () => {
    expect(parseAdminUserPage({ page: ["2", "4"] })).toEqual({ page: 2, invalid: null });
    expect(parseAdminUserFilters({ q: ["rangga", "salsa"] })).toEqual({ q: "rangga" });
  });

  it("falls back to the first page and keeps the junk for the page to name", () => {
    expect(parseAdminUserPage({ page: "abc" })).toEqual({ page: 1, invalid: "abc" });
    expect(parseAdminUserPage({ page: "0" })).toEqual({ page: 1, invalid: "0" });
    expect(parseAdminUserPage({ page: "<img src=x onerror=alert(1)>" })).toEqual({
      page: 1,
      invalid: "<img src=x onerror=alert(1)>",
    });
  });
});

describe("the admin list's query", () => {
  it("asks the API for ten rows a page, always", () => {
    expect(ADMIN_USERS_PAGE_SIZE).toBe(10);
    expect(buildAdminUsersQuery({ q: "" }, 1)).toBe("page=1&pageSize=10");
  });

  it("sends the search under the API's name, however it was typed", () => {
    const query = new URLSearchParams(buildAdminUsersQuery({ q: "rangga pratama" }, 2));

    expect(query.get("search")).toBe("rangga pratama");
    expect(query.get("page")).toBe("2");
    expect(query.get("pageSize")).toBe("10");
  });

  // The page's own address, for Pagination and the retry link, keeps the app's `q` and leaves
  // the defaults out so the bare list stays a bare address.
  it("builds the page's address without defaults and with a page only past the first", () => {
    expect(adminUserQuery({ q: "" }, 1)).toEqual({});
    expect(adminUserQuery({ q: "rangga" }, 1)).toEqual({ q: "rangga" });
    expect(adminUserQuery({ q: "rangga" }, 3)).toEqual({ q: "rangga", page: "3" });
  });
});

const API_USER = {
  id: "7d9f3d1a-0000-4000-8000-000000000001",
  name: "Rangga Pratama",
  email: "rangga@example.com",
  role: "super_admin",
  isActive: true,
  lastSignInAt: "2026-11-10T03:00:00.000Z",
  createdAt: "2026-10-01T02:00:00.000Z",
};

describe("the admin list's rows", () => {
  it("names each role and status the way the screen does", () => {
    expect(ROLE_LABELS.super_admin).toBe("Super Admin");
    expect(ROLE_LABELS.admin).toBe("Admin");
    expect(STATUS_LABELS.active).toBe("Aktif");
    expect(STATUS_LABELS.inactive).toBe("Nonaktif");
    expect(adminUserStatus({ isActive: true })).toBe("active");
    expect(adminUserStatus({ isActive: false })).toBe("inactive");
  });

  // A name is not backfilled for admins who signed in before PBI-23: their email is the name
  // the list can honestly show, as it is in history (23.10).
  it("reads an admin with no name by their email", () => {
    expect(adminUserDisplayName({ name: "  ", email: "rangga@example.com" })).toBe(
      "rangga@example.com",
    );
    expect(adminUserDisplayName({ name: "Rangga", email: "rangga@example.com" })).toBe("Rangga");
  });

  it("turns the API's answer into rows and counts the pages at ten a page", () => {
    const list = toAdminUserList({ items: [API_USER], page: 1, pageSize: 10, total: 12 });

    expect(list.items[0]).toMatchObject({
      id: API_USER.id,
      name: "Rangga Pratama",
      email: "rangga@example.com",
      role: "super_admin",
      isActive: true,
    });
    expect(list.total).toBe(12);
    expect(list.totalPages).toBe(2);
  });

  it("keeps a row's own-name flag, which shuts its self-actions", () => {
    const list = toAdminUserList({
      items: [{ ...API_USER, isSelf: true }],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    expect(list.items[0].isSelf).toBe(true);
  });

  it.each([
    ["nothing at all", null],
    ["a list that is not a list", { items: "nope", page: 1, pageSize: 10, total: 0 }],
    ["a row with no id", { items: [{ ...API_USER, id: undefined }], page: 1, pageSize: 10, total: 1 }],
    ["a row with no email", { items: [{ ...API_USER, email: null }], page: 1, pageSize: 10, total: 1 }],
    ["a role it does not know", { items: [{ ...API_USER, role: "owner" }], page: 1, pageSize: 10, total: 1 }],
    ["a row without a status", { items: [{ ...API_USER, isActive: "yes" }], page: 1, pageSize: 10, total: 1 }],
  ])("refuses %s rather than drawing a half-read table", (_label, answer) => {
    expect(() => toAdminUserList(answer)).toThrow();
  });
});

describe("the admin answer's field set", () => {
  it("carries the six facts and ignores anything else the API adds", () => {
    const list = toAdminUserList({
      items: [{ ...API_USER, nickname: "rangga", isSelf: false }],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    expect(list.items[0]).not.toHaveProperty("nickname");
    expect(list.items[0].isSelf).toBeUndefined();
  });
});
