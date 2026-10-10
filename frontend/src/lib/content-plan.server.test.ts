import {
  DEFAULT_CONTENT_PLAN_PARAMS,
  type ContentPlanParams,
  type ContentPlanResponse,
} from "./content-plan";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

vi.mock("@/lib/creators.server", () => ({
  fetchCreators: vi.fn(),
}));

import { fetchCreators } from "@/lib/creators.server";
import { fetchContentPlan, fetchContentPlanCreatorOptions } from "./content-plan.server";

const RESPONSE: ContentPlanResponse = {
  items: [],
  total: 0,
  totalPages: 0,
  counts: { all: 0, action: 0, waiting: 0, done: 0 },
};

describe("fetchContentPlan", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("throws when BACKEND_URL is missing", async () => {
    vi.stubEnv("BACKEND_URL", undefined);
    await expect(fetchContentPlan(DEFAULT_CONTENT_PLAN_PARAMS)).rejects.toThrow(
      "BACKEND_URL is not configured",
    );
  });

  it("asks the contents list for the tab's page with the filters in the query", async () => {
    const state: ContentPlanParams = {
      ...DEFAULT_CONTENT_PLAN_PARAMS,
      tab: "action",
      q: "salsa",
      creator: ["id-1"],
      status: ["pending"],
      overdue: "yes",
      period: "next30",
      sort: "asc",
      page: 2,
    };

    await fetchContentPlan(state);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    expect(url).toBe(
      "http://localhost:3001/contents?tab=action&q=salsa&creator=id-1&status=pending&overdue=yes&period=next30&sort=asc&page=2",
    );
  });

  it("strips a trailing slash from BACKEND_URL", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");

    await fetchContentPlan(DEFAULT_CONTENT_PLAN_PARAMS);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3001/contents?page=1");
  });

  it("throws when the endpoint answers something other than ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchContentPlan(DEFAULT_CONTENT_PLAN_PARAMS)).rejects.toThrow(
      "Loading the content plan failed with HTTP 503",
    );
  });

  it("passes the session cookie on and answers with the parsed rows", async () => {
    sessionCookies.push({ name: "__session", value: "token" });

    const body = { ...RESPONSE, total: 3, totalPages: 1 };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    await expect(fetchContentPlan(DEFAULT_CONTENT_PLAN_PARAMS)).resolves.toEqual(body);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/contents?page=1",
      expect.objectContaining({
        cache: "no-store",
        headers: { cookie: "__session=token" },
      }),
    );
  });
});

describe("fetchContentPlanCreatorOptions", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.mocked(fetchCreators).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("collects every creator's id and name across the list's pages", async () => {
    vi.mocked(fetchCreators)
      .mockResolvedValueOnce({
        items: [
          { id: "id-1", name: "Salsa" },
          { id: "id-2", name: "Rangga" },
        ],
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: "id-3", name: "Lestari" }],
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      } as never);

    await expect(fetchContentPlanCreatorOptions()).resolves.toEqual([
      { id: "id-1", name: "Salsa" },
      { id: "id-2", name: "Rangga" },
      { id: "id-3", name: "Lestari" },
    ]);
  });

  it("stops asking after twenty pages, however long the database runs", async () => {
    vi.mocked(fetchCreators).mockImplementation(
      async (page) =>
        ({
          items: [{ id: `id-${page}`, name: `Creator ${page}` }],
          page,
          pageSize: 1,
          total: 500,
          totalPages: 500,
        }) as never,
    );

    const options = await fetchContentPlanCreatorOptions();

    expect(fetchCreators).toHaveBeenCalledTimes(20);
    expect(options).toHaveLength(20);
    expect(options.at(-1)).toEqual({ id: "id-20", name: "Creator 20" });
  });
});
