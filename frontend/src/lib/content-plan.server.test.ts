import type { RawContentList } from "./content-list-api";
import { DEFAULT_CONTENT_PLAN_PARAMS, type ContentPlanParams } from "./content-plan";

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

// GET /contents as subtask 5.1 answers it, in the API's own names.
const RESPONSE: RawContentList = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
  tabCounts: { all: 0, needs_approval: 0, waiting_creator: 0, done: 0 },
};

const CREATOR_A = "11111111-1111-4111-8111-111111111111";
const CREATOR_B = "22222222-2222-4222-8222-222222222222";

describe("fetchContentPlan", () => {
  beforeEach(() => {
    // Midday in Jakarta on 10 Oct 2026: the day the named periods are counted from.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T05:00:00Z"));
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("asks the contents list in the API's own words: its tab, one parameter per pick, a day range and its sort", async () => {
    const state: ContentPlanParams = {
      ...DEFAULT_CONTENT_PLAN_PARAMS,
      tab: "action",
      q: "salsa",
      creator: [CREATOR_A, CREATOR_B],
      status: ["pending", "draft_review"],
      overdue: "yes",
      period: "next30",
      sort: "asc",
      page: 2,
    };

    await fetchContentPlan(state);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    expect(url).toBe(
      "http://localhost:3001/contents?tab=needs_approval&q=salsa" +
        `&creator=${CREATOR_A}&creator=${CREATOR_B}&status=pending&status=draft_review` +
        "&overdue=true&deadlineFrom=2026-10-10&deadlineTo=2026-11-09&sort=deadline_asc&page=2",
    );
  });

  it("counts a named period from today in Jakarta, not from the server's UTC day", async () => {
    // 17.30 UTC on the 10th is already the 11th in WIB.
    vi.setSystemTime(new Date("2026-10-10T17:30:00Z"));

    await fetchContentPlan({ ...DEFAULT_CONTENT_PLAN_PARAMS, period: "next30" });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    expect(url).toBe(
      "http://localhost:3001/contents?deadlineFrom=2026-10-11&deadlineTo=2026-11-10&page=1",
    );
  });

  it("never sends the page's own words for a filter, which the API would answer with a 400", async () => {
    await fetchContentPlan({
      ...DEFAULT_CONTENT_PLAN_PARAMS,
      tab: "waiting",
      type: ["evergreen", "specific"],
      overdue: "no",
      period: "month",
      sort: "asc",
    });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    const sent = new URL(url).searchParams;

    expect(sent.get("tab")).toBe("waiting_creator");
    expect(sent.getAll("type")).toEqual(["evergreen", "specific"]);
    expect(sent.get("overdue")).toBe("false");
    expect(sent.get("sort")).toBe("deadline_asc");
    expect(sent.has("period")).toBe(false);
    expect(url).not.toContain("%2C");
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

    const body: RawContentList = {
      ...RESPONSE,
      items: [
        {
          id: "content-1",
          name: "Promo Lebaran",
          creatorId: CREATOR_A,
          creatorName: "Rangga Pratama",
          type: "specific",
          deadline: "2026-10-12",
          status: "draft_review",
          tags: [],
          revisionCount: 1,
        },
      ],
      total: 3,
      totalPages: 1,
      tabCounts: { all: 3, needs_approval: 1, waiting_creator: 2, done: 0 },
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    // The page gets its own names back: contentId for the panel, a counter per tab.
    await expect(fetchContentPlan(DEFAULT_CONTENT_PLAN_PARAMS)).resolves.toEqual({
      items: [
        {
          contentId: "content-1",
          name: "Promo Lebaran",
          creatorId: CREATOR_A,
          creatorName: "Rangga Pratama",
          type: "specific",
          deadline: "2026-10-12",
          status: "draft_review",
          tags: [],
          revisionCount: 1,
        },
      ],
      total: 3,
      totalPages: 1,
      counts: { all: 3, action: 1, waiting: 2, done: 0 },
    });
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
