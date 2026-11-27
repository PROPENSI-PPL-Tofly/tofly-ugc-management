import { backendGet } from "./backend.server";
import { EXECUTIVE_DASHBOARD_PATH, ExecutiveDashboardError } from "./executive-dashboard";
import { fetchExecutiveDashboard } from "./executive-dashboard.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

/** One month of each of #265's three charts. */
function chartMonth(label: string, pairs: [string, number][]) {
  return {
    month: label,
    parts: pairs.map(([key, value]) => ({ key, label: key, value })),
    total: pairs.reduce((sum, [, value]) => sum + value, 0),
  };
}

/** `count` months one after another, ending November 2026 (a 12-month range crosses a year). */
function labels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** GET /admin/dashboard as the backend (#265) answers it. */
function answer(months: string[] = labels(6)): unknown {
  return {
    range: { from: `${months[0]}-01`, to: `${months.at(-1)}-30`, previousFrom: "", previousTo: "" },
    kpis: [{ key: "totalSpending", value: 6, previous: 3 }],
    charts: [
      { key: "spending", months: months.map((m) => chartMonth(m, [["fixedRate", 1], ["additionalContent", 2], ["performanceBonus", 3]])) },
      { key: "views", months: months.map((m) => chartMonth(m, [["instagram", 4], ["tiktok", 5]])) },
      { key: "timeliness", months: months.map((m) => chartMonth(m, [["on_time", 6], ["late", 7], ["not_sent", 8]])) },
    ],
    creators: [],
    missingViewLinks: 2,
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchExecutiveDashboard", () => {
  it("asks for the range the page parsed and nothing else", async () => {
    mockedGet.mockResolvedValue(Response.json(answer(labels(12))));

    await fetchExecutiveDashboard({ months: 12, sort: "name", order: "asc" });

    expect(mockedGet).toHaveBeenCalledWith(`${EXECUTIVE_DASHBOARD_PATH}?range=12`);
    expect(EXECUTIVE_DASHBOARD_PATH).toBe("/admin/dashboard");
  });

  it("hands back the months and creators it read", async () => {
    mockedGet.mockResolvedValue(Response.json(answer()));

    const dashboard = await fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" });

    expect(dashboard.months.map((entry) => entry.month)).toEqual(labels(6));
    expect(dashboard.months[0].delivery).toEqual({ onTime: 6, late: 7, notSent: 8 });
    expect(dashboard.creators).toEqual([]);
  });

  it("hands the KPI cards their block and the header the months shown, from the same answer", async () => {
    mockedGet.mockResolvedValue(Response.json(answer()));

    const dashboard = await fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" });

    expect(dashboard.kpis).toEqual({ current: { totalSpending: 6, linksAwaitingData: 2 }, previous: { totalSpending: 3 } });
    expect(dashboard.period).toEqual({ from: "Jun 2026", to: "Nov 2026" });
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["is a month short of the range", labels(5)],
    ["skips a month inside the range", ["2026-06", "2026-07", "2026-08", "2026-10", "2026-11", "2026-12"]],
    ["has more months than the range", labels(7)],
  ])("fails as unusable (502) when the answer %s, instead of a chart that quietly closes the gap", async (_, months) => {
    mockedGet.mockResolvedValue(Response.json(answer(months)));

    await expect(fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" })).rejects.toMatchObject({
      name: "ExecutiveDashboardError",
      status: 502,
    });
  });

  it("fails with the backend's status, so a refused session is not read as an empty dashboard", async () => {
    mockedGet.mockResolvedValue(new Response("forbidden", { status: 403 }));

    await expect(fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" })).rejects.toMatchObject({
      name: "ExecutiveDashboardError",
      status: 403,
    });
  });

  it("fails as unusable (502) when a 200 is not JSON", async () => {
    mockedGet.mockResolvedValue(new Response("<html>", { status: 200 }));

    const loading = fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" });

    await expect(loading).rejects.toBeInstanceOf(ExecutiveDashboardError);
    await expect(loading).rejects.toMatchObject({ status: 502 });
  });
});
