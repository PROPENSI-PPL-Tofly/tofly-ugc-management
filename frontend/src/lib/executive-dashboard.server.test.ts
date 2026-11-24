import { backendGet } from "./backend.server";
import { EXECUTIVE_DASHBOARD_PATH, ExecutiveDashboardError } from "./executive-dashboard";
import { fetchExecutiveDashboard } from "./executive-dashboard.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

function answer(): unknown {
  return {
    months: [
      {
        month: "2026-11",
        spending: { fixedRate: 1, additionalContent: 2, performanceBonus: 3 },
        views: { instagram: 4, tiktok: 5 },
        delivery: { onTime: 6, late: 7, notSent: 8 },
      },
    ],
    creators: [],
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchExecutiveDashboard", () => {
  it("asks for the range the page parsed and nothing else", async () => {
    mockedGet.mockResolvedValue(Response.json(answer()));

    await fetchExecutiveDashboard({ months: 12, sort: "name", order: "asc" });

    expect(mockedGet).toHaveBeenCalledWith(`${EXECUTIVE_DASHBOARD_PATH}?months=12`);
  });

  it("hands back the months and creators it read", async () => {
    mockedGet.mockResolvedValue(Response.json(answer()));

    const dashboard = await fetchExecutiveDashboard({ months: 6, sort: "views", order: "desc" });

    expect(dashboard.months[0].delivery).toEqual({ onTime: 6, late: 7, notSent: 8 });
    expect(dashboard.creators).toEqual([]);
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
