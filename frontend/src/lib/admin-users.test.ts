import { parseAdminUserFilters, parseAdminUserPage } from "./admin-users";

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
