import { calendarDay, list, listOf, oneOf, pageNumber, single } from "./search-params";

describe("single", () => {
  it.each([
    [undefined, ""],
    ["a", "a"],
    [["first", "second"], "first"],
    [[], ""],
  ] as const)("reads %j as %j", (value, expected) => {
    expect(single(value as string | string[] | undefined)).toBe(expected);
  });
});

describe("list", () => {
  it("splits on commas, trims and drops blanks", () => {
    expect(list(" a, ,b ,, c")).toEqual(["a", "b", "c"]);
  });

  it("reads nothing as an empty list", () => {
    expect(list(undefined)).toEqual([]);
    expect(list([])).toEqual([]);
  });

  it("reads every value of a repeated parameter, not only the first", () => {
    // ?status=scheduled&status=pending, as a link from outside the app may write it.
    expect(list(["scheduled", "pending"])).toEqual(["scheduled", "pending"]);
  });

  it("reads repeated and comma-separated picks together, dropping blanks in either", () => {
    expect(list(["a,b", " ", "c, ,d"])).toEqual(["a", "b", "c", "d"]);
  });
});

describe("oneOf", () => {
  it("keeps an allowed value and falls back on anything else", () => {
    expect(oneOf(["asc", "desc"], "desc", "asc")).toBe("desc");
    expect(oneOf(["asc", "desc"], "up", "asc")).toBe("asc");
  });
});

describe("listOf", () => {
  it("keeps only the allowed picks, in the order given", () => {
    expect(listOf(["evergreen", "specific"], "specific,optional,evergreen")).toEqual([
      "specific",
      "evergreen",
    ]);
  });

  it("keeps the allowed picks of a repeated parameter too", () => {
    expect(listOf(["evergreen", "specific"], ["specific", "optional", "evergreen"])).toEqual([
      "specific",
      "evergreen",
    ]);
  });
});

describe("pageNumber", () => {
  it.each([
    [undefined, 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["1.5", 1],
    ["02", 1],
    ["abc", 1],
  ] as const)("reads %j as page %i", (value, expected) => {
    expect(pageNumber(value)).toBe(expected);
  });
});

describe("calendarDay", () => {
  it.each([
    ["2026-10-11", "2026-10-11"],
    ["2028-02-29", "2028-02-29"],
    ["2027-02-29", ""],
    ["2026-02-31", ""],
    ["2026-13-01", ""],
    ["11/10/2026", ""],
    ["", ""],
  ])("reads %j as %j", (raw, expected) => {
    expect(calendarDay(raw)).toBe(expected);
  });
});
