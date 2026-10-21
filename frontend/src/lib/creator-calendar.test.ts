import type { CreatorPeriod } from "./creator-detail";
import {
  CREATOR_CALENDAR_GROUPS,
  creatorCalendarGroup,
  isInPeriod,
  periodMonths,
} from "./creator-calendar";

const PERIOD: Pick<CreatorPeriod, "startDate" | "endDate"> = {
  startDate: "2026-06-15",
  endDate: "2026-09-14",
};

describe("CREATOR_CALENDAR_GROUPS", () => {
  it("is the Content Plan's tabs as a legend, with Overdue above them all", () => {
    expect(CREATOR_CALENDAR_GROUPS.map(({ key, label, tone }) => [key, label, tone])).toEqual([
      ["action", "Perlu Approval", "amber"],
      ["waiting", "Menunggu Kreator", "neutral"],
      ["done", "Selesai", "green"],
      ["overdue", "Overdue", "red"],
    ]);
  });
});

describe("creatorCalendarGroup", () => {
  it.each([
    ["pending", "action"],
    ["draft_review", "action"],
    ["scheduled", "waiting"],
    ["draft_revision", "waiting"],
    ["draft_approved", "waiting"],
    ["link_submitted", "done"],
  ] as const)("puts a %s content in the tab that holds it: %s", (status, group) => {
    expect(creatorCalendarGroup({ status, tags: [] })).toBe(group);
  });

  it("marks an overdue content overdue first, whatever its status", () => {
    expect(creatorCalendarGroup({ status: "draft_review", tags: ["overdue"] })).toBe("overdue");
  });

  it("leaves a late hand-in where its status puts it: late is history, not something to do", () => {
    expect(creatorCalendarGroup({ status: "link_submitted", tags: ["late_submission"] })).toBe("done");
  });
});

describe("periodMonths", () => {
  it("spans the months the period touches", () => {
    expect(periodMonths(PERIOD, "2026-07-02")).toEqual({
      first: { year: 2026, month: 6 },
      last: { year: 2026, month: 9 },
      opening: { year: 2026, month: 7 },
    });
  });

  it("opens on today's month while the period runs, its first and last day included", () => {
    expect(periodMonths(PERIOD, "2026-06-15").opening).toEqual({ year: 2026, month: 6 });
    expect(periodMonths(PERIOD, "2026-09-14").opening).toEqual({ year: 2026, month: 9 });
  });

  it("opens a period that has not started, or has ended, on its first month", () => {
    expect(periodMonths(PERIOD, "2026-06-14").opening).toEqual({ year: 2026, month: 6 });
    expect(periodMonths(PERIOD, "2026-12-01").opening).toEqual({ year: 2026, month: 6 });
  });

  it("crosses a year", () => {
    const months = periodMonths({ startDate: "2026-11-20", endDate: "2027-02-19" }, "2027-01-05");

    expect(months.first).toEqual({ year: 2026, month: 11 });
    expect(months.last).toEqual({ year: 2027, month: 2 });
    expect(months.opening).toEqual({ year: 2027, month: 1 });
  });
});

describe("isInPeriod", () => {
  it.each([
    ["2026-06-14", false],
    ["2026-06-15", true],
    ["2026-08-01", true],
    ["2026-09-14", true],
    ["2026-09-15", false],
  ])("reads %s as inside the period: %s", (day, inside) => {
    expect(isInPeriod(day, PERIOD)).toBe(inside);
  });
});
