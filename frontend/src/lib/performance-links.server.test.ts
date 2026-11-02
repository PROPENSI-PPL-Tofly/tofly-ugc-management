import { backendGet } from "./backend.server";
import {
  MY_PERFORMANCE_LINKS_PATH,
  PERFORMANCE_LINKS_PATH,
  PerformanceLinksError,
  parsePerformanceLinksParams,
} from "./performance-links";
import { fetchMyPerformanceLinks, fetchPerformanceLinks } from "./performance-links.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

const CREATOR_A = "11111111-1111-4111-8111-111111111111";
const CREATOR_B = "22222222-2222-4222-8222-222222222222";

/** GET /performance/links' page answer exactly as the API writes it. */
function answer(): unknown {
  return {
    items: [
      {
        linkId: "33333333-3333-4333-8333-333333333333",
        contentId: "44444444-4444-4444-8444-444444444444",
        contentName: "Evg_1_RanggaPratama_12102026",
        creatorId: CREATOR_A,
        creatorName: "Rangga Pratama",
        platform: "instagram",
        url: "https://instagram.com/p/x",
        views: 12400,
        likes: 900,
        comments: null,
        shares: null,
        state: "synced",
        lastSyncedAt: "2026-11-01T17:00:00.000Z",
        manualAt: null,
      },
    ],
    page: 2,
    pageSize: 10,
    total: 21,
    totalPages: 3,
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchPerformanceLinks", () => {
  it("asks the endpoint for the state's page and filters, each pick its own parameter", async () => {
    mockedGet.mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));

    await fetchPerformanceLinks(
      parsePerformanceLinksParams({
        creator: `${CREATOR_A},${CREATOR_B}`,
        platform: "instagram,tiktok",
        page: "2",
      }),
    );

    expect(mockedGet).toHaveBeenCalledWith(
      `${PERFORMANCE_LINKS_PATH}?creator=${CREATOR_A}&creator=${CREATOR_B}&platform=instagram&platform=tiktok&page=2`,
    );
  });

  it("reads the API's page answer into the list's rows", async () => {
    mockedGet.mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));

    const page = await fetchPerformanceLinks(parsePerformanceLinksParams({ page: "2" }));

    expect(page).toEqual({
      items: [
        {
          linkId: "33333333-3333-4333-8333-333333333333",
          contentId: "44444444-4444-4444-8444-444444444444",
          contentName: "Evg_1_RanggaPratama_12102026",
          creatorId: CREATOR_A,
          creatorName: "Rangga Pratama",
          platform: "instagram",
          url: "https://instagram.com/p/x",
          views: 12400,
          likes: 900,
          comments: null,
          shares: null,
          state: "synced",
          lastSyncedAt: "2026-11-01T17:00:00.000Z",
          manualAt: null,
        },
      ],
      page: 2,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it("keeps the status of a refused answer", async () => {
    mockedGet.mockResolvedValue(new Response("", { status: 403 }));

    await expect(fetchPerformanceLinks(parsePerformanceLinksParams({}))).rejects.toMatchObject({
      name: "PerformanceLinksError",
      status: 403,
    });
  });

  it("reads a 200 whose body is not the API's page as a failure, never an empty list", async () => {
    mockedGet.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));

    await expect(fetchPerformanceLinks(parsePerformanceLinksParams({}))).rejects.toMatchObject({
      name: "PerformanceLinksError",
      status: 502,
    });
  });
});

describe("fetchMyPerformanceLinks", () => {
  it("asks the creator's own list for the state's page and filters", async () => {
    mockedGet.mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));

    await fetchMyPerformanceLinks(parsePerformanceLinksParams({ platform: "tiktok", page: "3" }));

    expect(mockedGet).toHaveBeenCalledWith(`${MY_PERFORMANCE_LINKS_PATH}?platform=tiktok&page=3`);
  });

  it("reads the API's page answer into the list's rows", async () => {
    mockedGet.mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));

    const page = await fetchMyPerformanceLinks(parsePerformanceLinksParams({}));

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ creatorName: "Rangga Pratama", state: "synced" });
  });

  it("keeps the status of a refused answer, a 403 included", async () => {
    mockedGet.mockResolvedValue(new Response("", { status: 403 }));

    await expect(fetchMyPerformanceLinks(parsePerformanceLinksParams({}))).rejects.toMatchObject({
      name: "PerformanceLinksError",
      status: 403,
    });
  });
});

describe("PerformanceLinksError", () => {
  it("keeps the status so a 404 can read differently from a 502", () => {
    const error: PerformanceLinksError = new PerformanceLinksError(502);

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(502);
  });
});
