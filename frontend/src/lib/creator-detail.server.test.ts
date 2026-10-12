import type { RawContentList } from "./content-list-api";
import { DEFAULT_CREATOR_DETAIL_PARAMS } from "./creator-detail";
import type { RawCreatorDetail } from "./creator-detail-api";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

import { fetchCreatorDetail } from "./creator-detail.server";

const BACKEND = "http://localhost:3001";
const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OLDER = "22222222-2222-4222-8222-222222222222";
const NEWEST = "33333333-3333-4333-8333-333333333333";
const SOMEONE_ELSES = "99999999-9999-4999-8999-999999999999";

// GET /creators/:id as subtask 4.1 answers it (#91): the periods oldest first.
const DETAIL: RawCreatorDetail = {
  id: CREATOR,
  name: "Lestari Wulandari",
  email: "lestari@example.com",
  socials: { instagram: "lestariw" },
  contractHistory: [
    {
      id: OLDER,
      periodNumber: 1,
      type: "probation",
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "expired",
      contentQuota: 3,
      daysBetween: 7,
      contents: [{ type: "evergreen" }],
    },
    {
      id: NEWEST,
      periodNumber: 2,
      type: "regular",
      startDate: "2026-10-01",
      endDate: "2027-03-31",
      status: "active",
      contentQuota: 6,
      daysBetween: 14,
      contents: [{ type: "evergreen" }, { type: "specific" }],
    },
  ],
};

// GET /contents?contract=… as subtask 5.1 answers it.
const CONTENTS: RawContentList = {
  items: [
    {
      id: "content-1",
      name: "Evg_1_LestariWulandari_15102026",
      creatorId: CREATOR,
      creatorName: "Lestari Wulandari",
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
  tabCounts: { all: 1, needs_approval: 0, waiting_creator: 1, done: 0 },
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Answers each endpoint by its path, as the backend would, whichever order they are asked in. */
function backend({
  detail = answer(200, DETAIL),
  contents = answer(200, CONTENTS),
}: { detail?: Response | Error; contents?: Response | Error } = {}) {
  vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const reply = new URL(String(input)).pathname.startsWith("/contents") ? contents : detail;
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });
}

function requests(): [string, RequestInit][] {
  return vi.mocked(globalThis.fetch).mock.calls as [string, RequestInit][];
}

function urls(): string[] {
  return requests().map(([url]) => url);
}

describe("fetchCreatorDetail", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", BACKEND);
    vi.spyOn(globalThis, "fetch");
    backend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks for the creator, then for the first page of their newest period's content", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(urls()).toEqual([
      `${BACKEND}/creators/${CREATOR}`,
      `${BACKEND}/contents?contract=${NEWEST}&page=1`,
    ]);
  });

  it("asks for the period the address names, with its filters and page, in the API's own words", async () => {
    await fetchCreatorDetail(CREATOR, {
      contract: OLDER,
      type: ["evergreen", "specific"],
      status: ["scheduled"],
      page: 2,
    });

    expect(urls()[1]).toBe(
      `${BACKEND}/contents?contract=${OLDER}&type=evergreen&type=specific&status=scheduled&page=2`,
    );
  });

  it("never asks for a contract that is not this creator's, whatever the address names", async () => {
    await fetchCreatorDetail(CREATOR, {
      ...DEFAULT_CREATOR_DETAIL_PARAMS,
      contract: SOMEONE_ELSES,
    });

    expect(urls()[1]).toBe(`${BACKEND}/contents?contract=${NEWEST}&page=1`);
    expect(urls().join(" ")).not.toContain(SOMEONE_ELSES);
  });

  it("answers with the page's view: the profile, the periods and the open period's rows", async () => {
    const view = await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(view?.creator).toEqual({
      id: CREATOR,
      name: "Lestari Wulandari",
      email: "lestari@example.com",
      socials: { instagram: "lestariw" },
    });
    expect(view?.periods.map((period) => period.contractId)).toEqual([NEWEST, OLDER]);
    expect(view?.selected?.contractId).toBe(NEWEST);
    expect(view?.selected?.remainingEvergreenQuota).toBe(5);
    expect(view?.rows.map((row) => row.contentId)).toEqual(["content-1"]);
    expect(view?.total).toBe(1);
    expect(view).not.toHaveProperty("contractHistory");
  });

  it("asks once for a creator without any contract, who has no content to list", async () => {
    backend({ detail: answer(200, { ...DETAIL, contractHistory: [] }) });

    const view = await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(urls()).toEqual([`${BACKEND}/creators/${CREATOR}`]);
    expect(view?.selected).toBeNull();
    expect(view?.rows).toEqual([]);
  });

  it("always reads fresh, as a decision a moment ago changes what the table shows", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requests().map(([, init]) => init.cache)).toEqual(["no-store", "no-store"]);
  });

  it("strips a trailing slash from BACKEND_URL", async () => {
    vi.stubEnv("BACKEND_URL", `${BACKEND}//`);

    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(urls()).toEqual([
      `${BACKEND}/creators/${CREATOR}`,
      `${BACKEND}/contents?contract=${NEWEST}&page=1`,
    ]);
  });

  it("carries the session cookie on both requests, and only it", async () => {
    sessionCookies.push(
      { name: "theme", value: "dark" },
      { name: "__session", value: "token" },
      { name: "_ga", value: "GA1.2.3" },
    );

    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    expect(requests().map(([, init]) => init.headers)).toEqual([
      { cookie: "__session=token" },
      { cookie: "__session=token" },
    ]);
  });

  it("sends no cookie header at all when nobody is signed in", async () => {
    await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);

    for (const [, init] of requests()) expect(init).not.toHaveProperty("headers");
  });

  it("answers null for a creator the API does not have, without asking for content", async () => {
    backend({
      detail: answer(404, { code: "CREATOR_NOT_FOUND", message: "Creator tidak ditemukan" }),
    });

    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).resolves.toBeNull();
    expect(urls()).toEqual([`${BACKEND}/creators/${CREATOR}`]);
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
    "throws when the creator cannot be read (HTTP %i), so the page can offer a retry",
    async (status) => {
      backend({ detail: answer(status, {}) });

      await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
        `Loading creator detail failed with HTTP ${status}`,
      );
      expect(urls()).toHaveLength(1);
    },
  );

  it.each([400, 401, 403, 404, 500, 503])(
    "throws when the period's content cannot be read (HTTP %i), rather than showing an empty table",
    async (status) => {
      backend({ contents: answer(status, {}) });

      await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
        `Loading the creator's content failed with HTTP ${status}`,
      );
    },
  );

  it("throws when the backend cannot be reached", async () => {
    backend({ detail: new TypeError("fetch failed") });

    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
      "fetch failed",
    );
  });

  it("throws when the backend goes away between the two requests", async () => {
    backend({ contents: new TypeError("fetch failed") });

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
