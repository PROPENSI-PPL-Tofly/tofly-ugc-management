import type { CreatorPeriod } from "./creator-detail";
import { creatorCalendarGroup, isInPeriod, periodMonths } from "./creator-calendar";

const PERIOD: Pick<CreatorPeriod, "startDate" | "endDate"> = {
  startDate: "2026-06-15",
  endDate: "2026-09-14",
};

describe("creator calendar period boundaries", () => {
  it("opens on today's month while the period runs and on the first month outside it", () => {
    expect(periodMonths(PERIOD, "2026-06-15").opening).toEqual({ year: 2026, month: 6 });
    expect(periodMonths(PERIOD, "2026-08-01").opening).toEqual({ year: 2026, month: 8 });
    expect(periodMonths(PERIOD, "2026-09-14").opening).toEqual({ year: 2026, month: 9 });
    expect(periodMonths(PERIOD, "2026-12-01").opening).toEqual({ year: 2026, month: 6 });
  });

  it("spans a year without shifting calendar days", () => {
    expect(periodMonths({ startDate: "2026-11-20", endDate: "2027-02-19" }, "2027-01-05")).toEqual({
      first: { year: 2026, month: 11 },
      last: { year: 2027, month: 2 },
      opening: { year: 2027, month: 1 },
    });
  });

  it.each([
    ["2026-06-14", false],
    ["2026-06-15", true],
    ["2026-09-14", true],
    ["2026-09-15", false],
  ])("treats %s as inside the inclusive period: %s", (day, inside) => {
    expect(isInPeriod(day, PERIOD)).toBe(inside);
  });

  it("keeps late submitted content in the completed group", () => {
    expect(creatorCalendarGroup({ status: "link_submitted", tags: ["overdue"] })).toBe("done");
    expect(creatorCalendarGroup({ status: "draft_review", tags: ["overdue"] })).toBe("overdue");
  });
});
