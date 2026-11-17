import { pageOf } from "./pager";

const FIVE = ["a", "b", "c", "d", "e"];

describe("pageOf", () => {
  it("gives the first page's rows and where they sit in the whole list", () => {
    expect(pageOf(FIVE, 0, 2)).toEqual({ rows: ["a", "b"], page: 0, pages: 3, first: 1, last: 2, total: 5 });
  });

  it("gives a page from the middle", () => {
    expect(pageOf(FIVE, 1, 2)).toMatchObject({ rows: ["c", "d"], page: 1, first: 3, last: 4 });
  });

  it("gives a last page shorter than the rest", () => {
    expect(pageOf(FIVE, 2, 2)).toMatchObject({ rows: ["e"], page: 2, pages: 3, first: 5, last: 5 });
  });

  it("shows one row per page when asked to", () => {
    expect(pageOf(FIVE, 3, 1)).toMatchObject({ rows: ["d"], page: 3, pages: 5, first: 4, last: 4 });
  });

  it("holds a page past the end at the last page, so a shrinking list never shows nothing", () => {
    expect(pageOf(FIVE, 9, 2)).toMatchObject({ rows: ["e"], page: 2 });
  });

  it("holds a page before the start at the first page", () => {
    expect(pageOf(FIVE, -1, 2)).toMatchObject({ rows: ["a", "b"], page: 0 });
  });

  it("treats a page size under one as one row per page", () => {
    expect(pageOf(FIVE, 0, 0)).toMatchObject({ rows: ["a"], pages: 5 });
  });

  it("gives one empty page for an empty list", () => {
    expect(pageOf([], 0, 3)).toEqual({ rows: [], page: 0, pages: 1, first: 0, last: 0, total: 0 });
  });

  it("puts a list that fits on one page on that page", () => {
    expect(pageOf(FIVE, 0, 5)).toMatchObject({ rows: FIVE, pages: 1, first: 1, last: 5 });
  });
});
