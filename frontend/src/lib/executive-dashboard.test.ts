import {
  CREATOR_SORT_KEYS,
  DEFAULT_DASHBOARD_STATE,
  ExecutiveDashboardError,
  buildDashboardQuery,
  deliveryRows,
  isEmptyChart,
  monthLabel,
  nextCreatorSort,
  parseDashboardParams,
  reshapeExecutiveAnswer,
  sortCreators,
  spendingRows,
  toDashboardApiQuery,
  toExecutiveDashboard,
  viewsRows,
  type CreatorPerformance,
} from "./executive-dashboard";

const CREATOR_A = "11111111-1111-4111-8111-111111111111";
const CREATOR_B = "22222222-2222-4222-8222-222222222222";
const CREATOR_C = "33333333-3333-4333-8333-333333333333";

/** GET /dashboard/executive as 24.1 is asked to write it: the months oldest first, then the creators. */
function answer(): Record<string, unknown> {
  return {
    range: { months: 3, from: "2026-09", to: "2026-11" },
    months: [
      {
        month: "2026-09",
        spending: { fixedRate: 12_000_000, additionalContent: 1_500_000, performanceBonus: 400_000 },
        views: { instagram: 120_000, tiktok: 80_500 },
        delivery: { onTime: 18, late: 2, notSent: 0 },
      },
      {
        month: "2026-10",
        spending: { fixedRate: 12_000_000, additionalContent: 0, performanceBonus: 0 },
        views: { instagram: 0, tiktok: 0 },
        delivery: { onTime: 9, late: 4, notSent: 3 },
      },
    ],
    creators: [
      {
        creatorId: CREATOR_A,
        creatorName: "Rangga Pratama",
        spending: 8_000_000,
        contentSent: 6,
        contentQuota: 8,
        onTimeRate: 83.3,
        views: 150_000,
        costPer1000Views: 53_333.33,
      },
    ],
    // 24.2's part of the answer; the charts and the table never read it.
    kpis: { totalSpending: { value: 1, previous: 0 } },
  };
}

function row(overrides: Partial<CreatorPerformance>): CreatorPerformance {
  return {
    creatorId: CREATOR_A,
    creatorName: "Rangga Pratama",
    spending: 0,
    contentSent: 0,
    contentQuota: 0,
    onTimeRate: null,
    views: null,
    costPer1000Views: null,
    ...overrides,
  };
}

describe("the dashboard's state in the address", () => {
  it("opens on six months, the creators by views from high to low (AC Range, AC Creators)", () => {
    expect(parseDashboardParams({})).toEqual({ months: 6, sort: "views", order: "desc" });
    expect(DEFAULT_DASHBOARD_STATE).toEqual({ months: 6, sort: "views", order: "desc" });
  });

  it("takes 3, 6 or 12 months and nothing else", () => {
    expect(parseDashboardParams({ range: "3" }).months).toBe(3);
    expect(parseDashboardParams({ range: "12" }).months).toBe(12);
    expect(parseDashboardParams({ range: "24" }).months).toBe(6);
    expect(parseDashboardParams({ range: "6abc" }).months).toBe(6);
    expect(parseDashboardParams({ range: ["3", "12"] }).months).toBe(3);
  });

  it("takes only the table's own columns and directions as its order", () => {
    expect(parseDashboardParams({ sort: "spending", order: "asc" })).toMatchObject({
      sort: "spending",
      order: "asc",
    });
    expect(parseDashboardParams({ sort: "password", order: "sideways" })).toMatchObject({
      sort: "views",
      order: "desc",
    });
  });

  it("leaves the defaults out of the address, so the bare page stays at the bare path", () => {
    expect(buildDashboardQuery(DEFAULT_DASHBOARD_STATE)).toEqual({});
    expect(buildDashboardQuery({ months: 12, sort: "name", order: "asc" })).toEqual({
      range: "12",
      sort: "name",
      order: "asc",
    });
  });

  it("asks the API for the range alone; the table sorts the rows it already has", () => {
    expect(toDashboardApiQuery({ months: 12, sort: "name", order: "asc" }).toString()).toBe("range=12");
  });
});

describe("reading GET /dashboard/executive", () => {
  it("keeps the months and the creators as sent", () => {
    const dashboard = toExecutiveDashboard(answer());

    expect(dashboard.months.map(({ month }) => month)).toEqual(["2026-09", "2026-10"]);
    expect(dashboard.months[0].spending.additionalContent).toBe(1_500_000);
    expect(dashboard.creators).toEqual([
      {
        creatorId: CREATOR_A,
        creatorName: "Rangga Pratama",
        spending: 8_000_000,
        contentSent: 6,
        contentQuota: 8,
        onTimeRate: 83.3,
        views: 150_000,
        costPer1000Views: 53_333.33,
      },
    ]);
  });

  it("reads a creator with no views yet as no data, never as 0 (AC Data rules)", () => {
    const body = answer();
    body.creators = [row({ views: null, costPer1000Views: null, onTimeRate: null })];

    expect(toExecutiveDashboard(body).creators[0]).toMatchObject({
      views: null,
      costPer1000Views: null,
      onTimeRate: null,
    });
  });

  it.each([
    ["no body", null],
    ["no months", { ...answer(), months: undefined }],
    ["no creators", { ...answer(), creators: "none" }],
    ["a month that is not YYYY-MM", { ...answer(), months: [{ ...(answer().months as object[])[0], month: "Sep" }] }],
    [
      "the months out of order",
      { ...answer(), months: [...(answer().months as object[])].reverse() },
    ],
    [
      "a negative part of a bar",
      {
        ...answer(),
        months: [
          {
            ...(answer().months as object[])[0],
            spending: { fixedRate: -1, additionalContent: 0, performanceBonus: 0 },
          },
        ],
      },
    ],
    [
      "a fraction of a view",
      {
        ...answer(),
        months: [{ ...(answer().months as object[])[0], views: { instagram: 1.5, tiktok: 0 } }],
      },
    ],
    ["a creator without an id", { ...answer(), creators: [row({ creatorId: 7 as never })] }],
    ["an on-time rate past 100", { ...answer(), creators: [row({ onTimeRate: 140 })] }],
    ["a quota that is not a count", { ...answer(), creators: [row({ contentQuota: "8" as never })] }],
  ])("refuses %s as an unusable answer (502), never as an empty dashboard", (_name, body) => {
    expect(() => toExecutiveDashboard(body)).toThrow(ExecutiveDashboardError);

    try {
      toExecutiveDashboard(body);
    } catch (error) {
      expect((error as ExecutiveDashboardError).status).toBe(502);
    }
  });
});

describe("the three charts' bars", () => {
  const { months } = toExecutiveDashboard(answer());

  it("names each month the Indonesian way", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthLabel("2026-12")).toBe("Des 2026");
  });

  it("stacks Spending per Bulan by component and totals each month (AC Charts)", () => {
    expect(spendingRows(months)).toEqual([
      {
        month: "2026-09",
        label: "Sep 2026",
        values: { fixedRate: 12_000_000, additionalContent: 1_500_000, performanceBonus: 400_000 },
        total: 13_900_000,
      },
      {
        month: "2026-10",
        label: "Okt 2026",
        values: { fixedRate: 12_000_000, additionalContent: 0, performanceBonus: 0 },
        total: 12_000_000,
      },
    ]);
  });

  it("stacks Views per Bulan by platform", () => {
    expect(viewsRows(months).map(({ values, total }) => [values, total])).toEqual([
      [{ instagram: 120_000, tiktok: 80_500 }, 200_500],
      [{ instagram: 0, tiktok: 0 }, 0],
    ]);
  });

  it("stacks Ketepatan Pengiriman by what happened to the content due", () => {
    expect(deliveryRows(months).map(({ values, total }) => [values, total])).toEqual([
      [{ onTime: 18, late: 2, notSent: 0 }, 20],
      [{ onTime: 9, late: 4, notSent: 3 }, 16],
    ]);
  });

  it("calls a chart empty when no month has anything to stack", () => {
    expect(isEmptyChart([])).toBe(true);
    expect(isEmptyChart(viewsRows([months[1]]))).toBe(true);
    expect(isEmptyChart(viewsRows(months))).toBe(false);
  });
});

describe("ordering Performa Creator", () => {
  const rows = [
    row({ creatorId: CREATOR_A, creatorName: "Rangga", views: 1_000, spending: 5, contentSent: 1, contentQuota: 4 }),
    row({ creatorId: CREATOR_B, creatorName: "Ayu", views: null, spending: 9, contentSent: 3, contentQuota: 4 }),
    row({ creatorId: CREATOR_C, creatorName: "budi", views: 5_000, spending: 1, contentSent: 2, contentQuota: 0 }),
  ];
  const names = (sorted: readonly CreatorPerformance[]) => sorted.map(({ creatorName }) => creatorName);

  it("sorts by views from high to low, a creator with no data yet last (AC Creators)", () => {
    expect(names(sortCreators(rows, "views", "desc"))).toEqual(["budi", "Rangga", "Ayu"]);
  });

  it("keeps no data last whichever way a column runs", () => {
    expect(names(sortCreators(rows, "views", "asc"))).toEqual(["Rangga", "budi", "Ayu"]);
  });

  it("sorts names alphabetically, whatever their case", () => {
    expect(names(sortCreators(rows, "name", "asc"))).toEqual(["Ayu", "budi", "Rangga"]);
    expect(names(sortCreators(rows, "name", "desc"))).toEqual(["Rangga", "budi", "Ayu"]);
  });

  it("sorts content by the share of the quota sent, a creator with no quota last", () => {
    expect(names(sortCreators(rows, "content", "desc"))).toEqual(["Ayu", "Rangga", "budi"]);
  });

  it("never reorders the rows it was given", () => {
    sortCreators(rows, "spending", "desc");

    expect(names(rows)).toEqual(["Rangga", "Ayu", "budi"]);
  });

  it("breaks a tie by name, so the order never jumps between loads", () => {
    const tied = [row({ creatorName: "Zaki", spending: 1 }), row({ creatorName: "Ayu", spending: 1 })];

    expect(names(sortCreators(tied, "spending", "desc"))).toEqual(["Ayu", "Zaki"]);
  });

  it("turns a column over on a second press and starts another from its natural direction", () => {
    expect(nextCreatorSort({ sort: "views", order: "desc" }, "views")).toEqual({ sort: "views", order: "asc" });
    expect(nextCreatorSort({ sort: "views", order: "asc" }, "views")).toEqual({ sort: "views", order: "desc" });
    expect(nextCreatorSort({ sort: "views", order: "desc" }, "name")).toEqual({ sort: "name", order: "asc" });
    expect(nextCreatorSort({ sort: "name", order: "asc" }, "spending")).toEqual({ sort: "spending", order: "desc" });
  });

  it("offers every column of the table", () => {
    expect(CREATOR_SORT_KEYS).toEqual(["name", "spending", "content", "onTime", "views", "costPer1000"]);
  });
});

/** GET /admin/dashboard as 24.1 (#265) writes it: KPI cards, three generic charts, creator rows. */
function backendAnswer(): Record<string, unknown> {
  const parts = (pairs: [string, number][]) => pairs.map(([key, value]) => ({ key, label: key, value }));
  const card = (key: string, value: number | null, previous: number | null) => ({
    key,
    label: key,
    value,
    previous,
    change: null,
    direction: "flat",
    good: true,
    formula: "",
  });
  return {
    range: { from: "2026-10-01", to: "2026-11-30", previousFrom: "2026-08-01", previousTo: "2026-09-30" },
    kpis: [
      card("totalSpending", 9_000_000, 8_000_000),
      card("unpaid", 1_000_000, 0),
      card("totalViews", 5_000, 4_000),
      card("costPer1000Views", 1_800_000, 2_000_000),
      card("onTimeRate", 75, 80),
      card("engagementRate", null, 4.5),
    ],
    charts: [
      {
        key: "spending",
        months: [
          { month: "2026-10", parts: parts([["fixedRate", 5], ["additionalContent", 2], ["performanceBonus", 1]]), total: 8 },
          { month: "2026-11", parts: parts([["fixedRate", 0], ["additionalContent", 0], ["performanceBonus", 0]]), total: 0 },
        ],
      },
      {
        key: "views",
        months: [
          { month: "2026-10", parts: parts([["instagram", 30], ["tiktok", 20]]), total: 50 },
          { month: "2026-11", parts: parts([["instagram", 0], ["tiktok", 7]]), total: 7 },
        ],
      },
      {
        key: "timeliness",
        months: [
          { month: "2026-10", parts: parts([["on_time", 3], ["late", 1], ["not_sent", 0]]), total: 4 },
          { month: "2026-11", parts: parts([["on_time", 0], ["late", 0], ["not_sent", 2]]), total: 2 },
        ],
      },
    ],
    creators: [
      {
        creatorId: CREATOR_A,
        name: "Ana",
        spending: 9_000_000,
        sent: 4,
        quota: 6,
        onTimeRate: 75,
        views: 5_000,
        costPer1000Views: 1_800_000,
      },
    ],
    missingViewLinks: 3,
  };
}

describe("reshapeExecutiveAnswer", () => {
  it("lines the three charts up month by month for the charts' own check", () => {
    const { charts } = reshapeExecutiveAnswer(backendAnswer());
    const dashboard = toExecutiveDashboard(charts);

    expect(dashboard.months).toEqual([
      {
        month: "2026-10",
        spending: { fixedRate: 5, additionalContent: 2, performanceBonus: 1 },
        views: { instagram: 30, tiktok: 20 },
        delivery: { onTime: 3, late: 1, notSent: 0 },
      },
      {
        month: "2026-11",
        spending: { fixedRate: 0, additionalContent: 0, performanceBonus: 0 },
        views: { instagram: 0, tiktok: 7 },
        delivery: { onTime: 0, late: 0, notSent: 2 },
      },
    ]);
  });

  it("renames the creator rows to the table's fields", () => {
    const dashboard = toExecutiveDashboard(reshapeExecutiveAnswer(backendAnswer()).charts);

    expect(dashboard.creators).toEqual([
      {
        creatorId: CREATOR_A,
        creatorName: "Ana",
        spending: 9_000_000,
        contentSent: 4,
        contentQuota: 6,
        onTimeRate: 75,
        views: 5_000,
        costPer1000Views: 1_800_000,
      },
    ]);
  });

  it("hands the KPI cards both ranges' figures and the links still waiting for numbers", () => {
    expect(reshapeExecutiveAnswer(backendAnswer()).kpis).toEqual({
      current: {
        totalSpending: 9_000_000,
        unpaidAmount: 1_000_000,
        totalViews: 5_000,
        costPer1000Views: 1_800_000,
        onTimeRate: 75,
        engagementRate: null,
        linksAwaitingData: 3,
      },
      previous: {
        totalSpending: 8_000_000,
        unpaidAmount: 0,
        totalViews: 4_000,
        costPer1000Views: 2_000_000,
        onTimeRate: 80,
        engagementRate: 4.5,
      },
    });
  });

  it("names the months shown for the range header", () => {
    expect(reshapeExecutiveAnswer(backendAnswer()).period).toEqual({ from: "Okt 2026", to: "Nov 2026" });
  });

  it("leaves a card the answer did not send out, so only that card fails", () => {
    const body = backendAnswer();
    body.kpis = (body.kpis as { key: string }[]).filter((card) => card.key !== "unpaid");

    const { kpis } = reshapeExecutiveAnswer(body) as { kpis: { current: object; previous: object } };

    expect(kpis.current).not.toHaveProperty("unpaidAmount");
    expect(kpis.previous).not.toHaveProperty("unpaidAmount");
  });

  it("fails the charts when one chart is missing a month the others have", () => {
    const body = backendAnswer();
    const views = (body.charts as { key: string; months: unknown[] }[])[1];
    views.months = views.months.slice(0, 1);

    expect(() => toExecutiveDashboard(reshapeExecutiveAnswer(body).charts)).toThrow(ExecutiveDashboardError);
  });

  it.each([
    ["not an object", "<html>"],
    ["without charts or creators", {}],
    ["with charts and creators that are not lists", { charts: "x", creators: "x", kpis: "x", range: null }],
    ["with malformed months and parts", { charts: [{ key: "spending", months: [null, { month: "2026-11", parts: "x" }] }, "x"], creators: [null] }],
  ])("gives the checks nothing usable when the answer is %s", (_, body) => {
    const reshaped = reshapeExecutiveAnswer(body);

    expect(() => toExecutiveDashboard(reshaped.charts)).toThrow(ExecutiveDashboardError);
    expect(reshaped.period).toBeNull();
  });
});
