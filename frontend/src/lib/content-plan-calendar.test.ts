import {
  buildContentPlanQuery,
  contentPlanMonthHref,
  contentPlanViewHref,
  keptOnReset,
  parseContentPlanParams,
  DEFAULT_CONTENT_PLAN_PARAMS,
} from "./content-plan";
import {
  calendarChipLabel,
  calendarChipTitle,
  CALENDAR_PAGE_LIMIT,
  isCalendarOverdue,
  isPendingProposal,
  monthRange,
  shownMonth,
} from "./content-plan-calendar";
import type { ContentPlanRow } from "./content-plan";

function row(overrides: Partial<ContentPlanRow> = {}): ContentPlanRow {
  return {
    contentId: "content-1",
    name: "Review Serum Pagi",
    creatorId: "11111111-1111-4111-8111-111111111111",
    creatorName: "Salsa Wijaya",
    type: "specific",
    deadline: "2026-11-12",
    status: "scheduled",
    tags: [],
    revisionCount: 0,
    platforms: [],
    ...overrides,
  };
}

describe("Content Plan view in the URL", () => {
  it("shows the table unless the address asks for the calendar by its exact name", () => {
    expect(parseContentPlanParams({}).view).toBe("table");
    expect(parseContentPlanParams({ view: "calendar" }).view).toBe("calendar");
    expect(parseContentPlanParams({ view: "<script>" }).view).toBe("table");
    expect(parseContentPlanParams({ view: ["calendar", "table"] }).view).toBe(
      "calendar",
    );
  });

  it("keeps a real YYYY-MM month on the calendar and drops anything else (OWASP A10)", () => {
    expect(
      parseContentPlanParams({ view: "calendar", month: "2026-12" }).month,
    ).toBe("2026-12");
    for (const bad of [
      "2026-13",
      "2026-00",
      "2026-1",
      "26-11",
      "2026-11-01",
      "abc",
      "",
    ]) {
      expect(
        parseContentPlanParams({ view: "calendar", month: bad }).month,
      ).toBe("");
    }
    // The table has no month: a month left in its address means nothing.
    expect(parseContentPlanParams({ month: "2026-12" }).month).toBe("");
  });

  it("lets the calendar's month be its range: period, days and page are dropped", () => {
    const state = parseContentPlanParams({
      view: "calendar",
      period: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
      page: "3",
    });
    expect(state).toMatchObject({ period: "all", from: "", to: "", page: 1 });
  });

  it("writes the view and month only when they are not the default", () => {
    expect(buildContentPlanQuery(DEFAULT_CONTENT_PLAN_PARAMS)).toEqual({});
    expect(
      buildContentPlanQuery({
        ...DEFAULT_CONTENT_PLAN_PARAMS,
        view: "calendar",
        month: "2026-12",
      }),
    ).toEqual({ view: "calendar", month: "2026-12" });
  });

  it("carries the tab, search and filters across the toggle, but not the page, period or month", () => {
    const table = parseContentPlanParams({
      tab: "waiting",
      q: "salsa",
      type: "specific",
      overdue: "yes",
      period: "month",
      page: "2",
    });
    expect(contentPlanViewHref("calendar", table)).toBe(
      "/admin/content-plan?tab=waiting&q=salsa&type=specific&overdue=yes&view=calendar",
    );

    const calendar = parseContentPlanParams({
      tab: "waiting",
      view: "calendar",
      month: "2026-12",
    });
    expect(contentPlanViewHref("table", calendar)).toBe(
      "/admin/content-plan?tab=waiting",
    );
  });

  it("turns the month keeping every filter, and Hari Ini goes back to the bare calendar", () => {
    const state = parseContentPlanParams({
      view: "calendar",
      creator: "abc",
      status: "pending",
    });
    expect(contentPlanMonthHref(state, { year: 2027, month: 1 })).toBe(
      "/admin/content-plan?creator=abc&status=pending&view=calendar&month=2027-01",
    );
    expect(contentPlanMonthHref(state, null)).toBe(
      "/admin/content-plan?creator=abc&status=pending&view=calendar",
    );
  });

  it("keeps the tab, view and month through a filter reset", () => {
    expect(
      keptOnReset(
        new URLSearchParams(
          "tab=done&q=x&view=calendar&month=2026-12&type=evergreen",
        ),
      ),
    ).toEqual({ tab: "done", view: "calendar", month: "2026-12" });
    expect(keptOnReset(new URLSearchParams("q=x&creator=a"))).toEqual({});
  });
});

describe("Content Plan calendar month", () => {
  it("shows the address's month, or today's when it names none", () => {
    expect(shownMonth("2027-02", "2026-11-12")).toEqual({
      year: 2027,
      month: 2,
    });
    expect(shownMonth("", "2026-11-12")).toEqual({ year: 2026, month: 11 });
  });

  it("covers the whole month, leap days and year ends included", () => {
    expect(monthRange({ year: 2028, month: 2 })).toEqual([
      "2028-02-01",
      "2028-02-29",
    ]);
    expect(monthRange({ year: 2026, month: 12 })).toEqual([
      "2026-12-01",
      "2026-12-31",
    ]);
  });

  it("caps the fetch at twenty pages of fifty", () => {
    expect(CALENDAR_PAGE_LIMIT).toBe(20);
  });
});

describe("Content Plan calendar chips", () => {
  it("reads the creator's first name and the content name", () => {
    expect(calendarChipLabel(row())).toBe("Salsa · Review Serum Pagi");
  });

  it("falls back to the content name alone when the creator name is missing", () => {
    expect(calendarChipLabel(row({ creatorName: "" }))).toBe(
      "Review Serum Pagi",
    );
    expect(
      calendarChipLabel(row({ creatorName: undefined as unknown as string })),
    ).toBe("Review Serum Pagi");
  });

  it("names the full creator, the status and any flag in the title", () => {
    expect(calendarChipTitle(row())).toBe(
      "Review Serum Pagi · Salsa Wijaya · Scheduled",
    );
    expect(calendarChipTitle(row({ tags: ["overdue"] }))).toBe(
      "Review Serum Pagi · Salsa Wijaya · Scheduled · Overdue",
    );
    expect(calendarChipTitle(row({ status: "pending" }))).toBe(
      "Review Serum Pagi · Salsa Wijaya · Pending · Menunggu persetujuan",
    );
  });

  it("marks only unfinished content as overdue; a late hand-in is finished", () => {
    expect(isCalendarOverdue(row({ tags: ["overdue"] }))).toBe(true);
    expect(
      isCalendarOverdue(row({ status: "link_submitted", tags: ["overdue"] })),
    ).toBe(false);
    expect(isCalendarOverdue(row())).toBe(false);
    expect(isCalendarOverdue(row({ tags: undefined as unknown as [] }))).toBe(
      false,
    );
  });

  it("knows a pending proposal by its status", () => {
    expect(isPendingProposal(row({ status: "pending" }))).toBe(true);
    expect(isPendingProposal(row({ status: "draft_review" }))).toBe(false);
  });
});
