import { DEFAULT_CREATOR_DETAIL_PARAMS } from "./creator-detail";
import type { RawCreatorDetail } from "./creator-detail-api";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

import { fetchCreatorDetail } from "./creator-detail.server";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "33333333-3333-4333-8333-333333333333";

// GET /creators/:id as subtask 4.1 answers it, in the API's own names.
const RESPONSE: RawCreatorDetail = {
  id: CREATOR,
  name: "Lestari Wulandari",
  email: "lestari@example.com",
  instagramUsername: "lestariw",
  tiktokUsername: null,
  contracts: [
    {
      id: CONTRACT,
      type: "regular",
      startDate: "2026-10-01",
      endDate: "2027-03-31",
      status: "active",
      fixedRate: "3300000.00",
      contentQuota: 6,
      remainingEvergreenQuota: 4,
      daysBetween: 14,
      contents: {
        items: [
          {
            id: "content-1",
            name: "Evg_1_LestariWulandari_15102026",
            type: "evergreen",
            deadline: "2026-10-15",
            status: "scheduled",
            tags: [],
            revisionCount: 0,
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      },
    },
  ],
};

function answer(status: number, body: unknown = RESPONSE): Response {
  return new Response(JSON.stringify(body), { status });
}

function requested(): [string, RequestInit] {
  return vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
}

describe("fetchCreatorDetail", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answer(200));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks for the creator's first page on the bare view", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requested()[0]).toBe(`http://localhost:3001/creators/${CREATOR}?page=1`);
  });

  it("asks in the API's own words: the open contract, one parameter per pick, and the page", async () => {
    await fetchCreatorDetail(CREATOR, {
      contract: CONTRACT,
      type: ["evergreen", "specific"],
      status: ["scheduled"],
      page: 2,
    });

    expect(requested()[0]).toBe(
      `http://localhost:3001/creators/${CREATOR}?contract=${CONTRACT}` +
        "&type=evergreen&type=specific&status=scheduled&page=2",
    );
  });

  it("answers with the page's view of the creator, never the API's own shape", async () => {
    const view = await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(view?.creator).toEqual({
      id: CREATOR,
      name: "Lestari Wulandari",
      email: "lestari@example.com",
      socials: { instagram: "lestariw" },
    });
    expect(view?.selected?.fixedRate).toBe(3300000);
    expect(view?.rows.map((row) => row.contentId)).toEqual(["content-1"]);
    expect(view).not.toHaveProperty("contracts");
  });

  it("always reads fresh, as a decision a moment ago changes what the table shows", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requested()[1].cache).toBe("no-store");
  });

  it("strips a trailing slash from BACKEND_URL", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001//");

    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requested()[0]).toBe(`http://localhost:3001/creators/${CREATOR}?page=1`);
  });

  it("carries the session cookie, and only it", async () => {
    sessionCookies.push(
      { name: "theme", value: "dark" },
      { name: "__session", value: "token" },
      { name: "_ga", value: "GA1.2.3" },
    );

    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requested()[1].headers).toEqual({ cookie: "__session=token" });
  });

  it("sends no cookie header at all when nobody is signed in", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requested()[1]).not.toHaveProperty("headers");
  });

  it("answers null for a creator the API does not have", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      answer(404, { code: "CREATOR_NOT_FOUND", message: "Creator tidak ditemukan" }),
    );

    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).resolves.toBeNull();
  });

  it.each([
    ["a word", "rangga"],
    ["a path out of the creators", "../contents"],
    ["an id with a query behind it", `${CREATOR}?admin=true`],
    ["an id with a statement behind it", `${CREATOR}' OR '1'='1`],
    ["nothing", ""],
  ])("answers null for an id that is %s, without asking the API", async (_, id) => {
    await expect(fetchCreatorDetail(id, DEFAULT_CREATOR_DETAIL_PARAMS)).resolves.toBeNull();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 500, 503])(
    "throws when the endpoint answers %i, so the page can offer a retry",
    async (status) => {
      vi.mocked(globalThis.fetch).mockResolvedValue(answer(status, {}));

      await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
        `Loading creator detail failed with HTTP ${status}`,
      );
    },
  );

  it("throws when the backend cannot be reached", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("fetch failed"));

    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
      "fetch failed",
    );
  });

  it("throws when BACKEND_URL is missing", async () => {
    vi.stubEnv("BACKEND_URL", undefined);

    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
      "BACKEND_URL is not configured",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
