import type { RawContentList, RawContentListItem } from "./content-list-api";
import {
  DEFAULT_CONTENT_PLAN_PARAMS,
  type ContentPlanParams,
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

import {
  ContentPlanCalendarTooLargeError,
  fetchContentPlanMonth,
} from "./content-plan.server";

const CREATOR_A = "11111111-1111-4111-8111-111111111111";

function item(id: string, deadline: string): RawContentListItem {
  return {
    id,
    name: `Konten ${id}`,
    creatorId: CREATOR_A,
    creatorName: "Salsa Wijaya",
    type: "evergreen",
    deadline,
    status: "scheduled",
    tags: [],
    revisionCount: 0,
    platforms: [],
  };
}

function pageOf(
  page: number,
  totalPages: number,
  items: RawContentListItem[],
): RawContentList {
  return {
    items,
    page,
    pageSize: 50,
    total: totalPages * 50,
    totalPages,
    tabCounts: { all: 120, needs_approval: 4, waiting_creator: 60, done: 56 },
  };
}

/** Answers each page by its number, so the order the requests resolve in cannot matter. */
function backend(totalPages: number, failOn: number | null = null) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const page = Number(url.searchParams.get("page"));
    if (page === failOn) return new Response("down", { status: 503 });
    return new Response(
      JSON.stringify(
        pageOf(page, totalPages, [
          item(`p${page}`, `2026-11-${String(page).padStart(2, "0")}`),
        ]),
      ),
      { status: 200 },
    );
  });
}

function requested(): URL[] {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([input]) => new URL(String(input)));
}

describe("fetchContentPlanMonth", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks for the month's days in the largest pages, earliest first, under the tab and filters (OWASP A06)", async () => {
    backend(1);
    const state: ContentPlanParams = {
      ...DEFAULT_CONTENT_PLAN_PARAMS,
      view: "calendar",
      tab: "action",
      q: "serum",
      creator: [CREATOR_A],
      type: ["specific"],
      status: ["pending"],
      overdue: "yes",
      // A stale period must never narrow the month.
      period: "last90",
    };

    await fetchContentPlanMonth(state, { year: 2026, month: 11 });

    const [url] = requested();
    expect(url.pathname).toBe("/contents");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tab: "needs_approval",
      q: "serum",
      creator: CREATOR_A,
      type: "specific",
      status: "pending",
      overdue: "true",
      deadlineFrom: "2026-11-01",
      deadlineTo: "2026-11-30",
      sort: "deadline_asc",
      page: "1",
      pageSize: "50",
    });
  });

  it("carries the browser's session and only it (OWASP A01)", async () => {
    backend(1);
    sessionCookies.push(
      { name: "__session", value: "abc" },
      { name: "other", value: "leak" },
    );

    await fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
      year: 2026,
      month: 11,
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.headers).toEqual({ cookie: "__session=abc" });
  });

  it("reads every page and hands back every row with the first page's counters", async () => {
    backend(3);

    const result = await fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
      year: 2026,
      month: 11,
    });

    expect(
      requested()
        .map((url) => url.searchParams.get("page"))
        .sort(),
    ).toEqual(["1", "2", "3"]);
    expect(result.items.map((row) => row.contentId)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(result.total).toBe(150);
    expect(result.counts).toEqual({
      all: 120,
      action: 4,
      waiting: 60,
      done: 56,
    });
  });

  it("crosses the year end with the right days", async () => {
    backend(1);

    await fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
      year: 2027,
      month: 1,
    });

    expect(requested()[0].searchParams.get("deadlineFrom")).toBe("2027-01-01");
    expect(requested()[0].searchParams.get("deadlineTo")).toBe("2027-01-31");
  });

  it("fails the whole read when any page fails, never showing a partial month (OWASP A10)", async () => {
    backend(3, 2);

    await expect(
      fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
        year: 2026,
        month: 11,
      }),
    ).rejects.toThrow("HTTP 503");
  });

  it("reads twenty pages, the limit, in full", async () => {
    backend(20);

    const result = await fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
      year: 2026,
      month: 11,
    });

    expect(result.items).toHaveLength(20);
  });

  it("refuses a month past twenty pages rather than truncating it, and asks for no more (OWASP A06)", async () => {
    backend(21);

    await expect(
      fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
        year: 2026,
        month: 11,
      }),
    ).rejects.toBeInstanceOf(ContentPlanCalendarTooLargeError);
    expect(requested()).toHaveLength(1);
  });

  it("returns an empty month as empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...pageOf(1, 1, []), total: 0 }), {
        status: 200,
      }),
    );

    const result = await fetchContentPlanMonth(DEFAULT_CONTENT_PLAN_PARAMS, {
      year: 2026,
      month: 11,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
