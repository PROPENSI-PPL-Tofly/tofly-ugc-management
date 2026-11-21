import {
  ADMIN_USERS_PAGE_SIZE,
  adminUserQuery,
  buildAdminUsersQuery,
  parseAdminUserFilters,
  parseAdminUserPage,
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
