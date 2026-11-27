import { backendGet } from "./backend.server";
import { EXECUTIVE_DASHBOARD_PATH, ExecutiveDashboardError } from "./executive-dashboard";
import { fetchExecutiveDashboard } from "./executive-dashboard.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

function month(label: string) {
  return {
    month: label,
    spending: { fixedRate: 1, additionalContent: 2, performanceBonus: 3 },
    views: { instagram: 4, tiktok: 5 },
    delivery: { onTime: 6, late: 7, notSent: 8 },
  };
}

/** `count` months one after another, ending November 2026 (a 12-month range crosses a year). */
function labels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function answer(months: string[] = labels(6)): unknown {
  return { months: months.map(month), creators: [] };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchExecutiveDashboard", () => {
  it("asks for the range the page parsed and nothing else", async () => {
    mockedGet.mockResolvedValue(Response.json(answer(labels(12))));

    await fetchExecutiveDashboard({ months: 12, sort: "name", order: "asc" });

    expect(mockedGet).toHaveBeenCalledWith(`${EXECUTIVE_DASHBOARD_PATH}?months=12`);
  });

  it("hands back the months and creators it read", async () => {
    mockedGet.mockResolvedValue(Response.json(answer()));

    const dashboard = await fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" });

    expect(dashboard.months.map((entry) => entry.month)).toEqual(labels(6));
    expect(dashboard.months[0].delivery).toEqual({ onTime: 6, late: 7, notSent: 8 });
    expect(dashboard.creators).toEqual([]);
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
