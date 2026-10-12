import { DEFAULT_MY_TASKS_PARAMS, type MyTasksParams } from "./my-tasks";
import { toMyContentsQuery, toMyTasksResponse, type RawMyContents } from "./my-tasks-api";

const TODAY = "2026-10-11";

const query = (patch: Partial<MyTasksParams> = {}) =>
  toMyContentsQuery({ ...DEFAULT_MY_TASKS_PARAMS, ...patch }, TODAY).toString();

// These are the names GET /me/contents reads (my-contents.controller.ts). A name spelled
// differently here would leave its filter doing nothing without a sound, so each is pinned.
describe("toMyContentsQuery", () => {
  it("asks for the first page of ten in Semua and leaves every default to the API", () => {
    expect(query()).toBe("page=1&pageSize=10");
  });

  it.each([
    [{ tab: "action" as const }, "tab=to_do"],
    [{ tab: "waiting" as const }, "tab=waiting_admin"],
    [{ tab: "done" as const }, "tab=done"],
  ])("speaks the API's name for the %j tab", (patch, expected) => {
    expect(query(patch)).toBe(`${expected}&page=1&pageSize=10`);
  });

  it("sends each pick as its own parameter, the way the API reads a list", () => {
    expect(query({ type: ["evergreen", "specific"], status: ["scheduled", "draft_revision"] })).toBe(
      "type=evergreen&type=specific&status=scheduled&status=draft_revision&page=1&pageSize=10",
    );
  });

  it("sends the search, cut to what the API takes", () => {
    expect(query({ q: "x".repeat(150) })).toBe(`q=${"x".repeat(100)}&page=1&pageSize=10`);
  });

  it.each([
    ["yes", "overdue=true&"],
    ["no", "overdue=false&"],
    ["all", ""],
  ] as const)("sends overdue=%s as the API's true or false", (overdue, expected) => {
    expect(query({ overdue })).toBe(`${expected}page=1&pageSize=10`);
  });

  it("turns a named period into the two days it covers, counted from today", () => {
    expect(query({ period: "next30" })).toBe(
      "deadlineFrom=2026-10-11&deadlineTo=2026-11-10&page=1&pageSize=10",
    );
  });

  it("sends a custom range with only the end it has", () => {
    expect(query({ period: "custom", to: "2026-10-31" })).toBe("deadlineTo=2026-10-31&page=1&pageSize=10");
  });

  it("asks for the furthest deadline first only when the page wants it", () => {
    expect(query({ sort: "desc" })).toBe("sort=deadline_desc&page=1&pageSize=10");
  });

  it("asks for the page the address names", () => {
    expect(query({ page: 4 })).toBe("page=4&pageSize=10");
  });

  it("keeps a value picked twice once", () => {
    expect(query({ type: ["specific", "specific"] })).toBe("type=specific&page=1&pageSize=10");
  });
});

describe("toMyTasksResponse", () => {
  const raw: RawMyContents = {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    tabCounts: { all: 7, to_do: 5, waiting_admin: 1, done: 1 },
  };

  it("files each counter under the page's name for its tab", () => {
    expect(toMyTasksResponse(raw)).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      counts: { all: 7, action: 5, waiting: 1, done: 1 },
    });
  });
});
