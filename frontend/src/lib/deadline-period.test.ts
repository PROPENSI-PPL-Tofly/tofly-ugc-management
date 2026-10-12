import { periodRange, type PeriodState } from "./deadline-period";

const named = (period: PeriodState["period"]): PeriodState => ({ period, from: "", to: "" });

describe("periodRange", () => {
  it("leaves both ends open when no period is picked", () => {
    expect(periodRange(named("all"), "2026-10-11")).toEqual(["", ""]);
  });

  it.each([
    ["a 31-day month", "2026-10-11", ["2026-10-01", "2026-10-31"]],
    ["a leap February", "2028-02-10", ["2028-02-01", "2028-02-29"]],
    ["a common February", "2027-02-28", ["2027-02-01", "2027-02-28"]],
    ["December, across the year end", "2026-12-31", ["2026-12-01", "2026-12-31"]],
  ])("covers the whole month for %s", (_label, today, expected) => {
    expect(periodRange(named("month"), today)).toEqual(expected);
  });

  it("counts the next 30 days from today, across a month end", () => {
    expect(periodRange(named("next30"), "2026-10-11")).toEqual(["2026-10-11", "2026-11-10"]);
  });

  it("counts the last 90 days up to today, across a year start", () => {
    expect(periodRange(named("last90"), "2027-01-15")).toEqual(["2026-10-17", "2027-01-15"]);
  });

  it("keeps a custom range as picked, either end left open", () => {
    expect(periodRange({ period: "custom", from: "2026-10-01", to: "" }, "2026-10-11")).toEqual([
      "2026-10-01",
      "",
    ]);
  });

  it("puts a custom range picked backwards in order, since the API refuses it otherwise", () => {
    expect(
      periodRange({ period: "custom", from: "2026-10-31", to: "2026-10-01" }, "2026-10-11"),
    ).toEqual(["2026-10-01", "2026-10-31"]);
  });
});
