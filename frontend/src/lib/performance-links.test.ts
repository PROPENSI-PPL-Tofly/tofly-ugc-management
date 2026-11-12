import {
  MY_PERFORMANCE_LINKS_PATH,
  PERFORMANCE_LINKS_BASE,
  PERFORMANCE_LINKS_PATH,
  PERFORMANCE_PAGE_SIZE,
  PerformanceLinksError,
  buildPerformanceLinksQuery,
  parsePerformanceLinksParams,
  performanceLinksHref,
  toPerformanceLinksPage,
  toPerformanceLinksQuery,
} from "./performance-links";

const CREATOR_A = "11111111-1111-4111-8111-111111111111";
const CREATOR_B = "22222222-2222-4222-8222-222222222222";

/** GET /performance/links' row exactly as the API writes it (backend's toPerformanceLinkItem). */
function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    manualBy: null,
    ...overrides,
  };
}

/** GET /performance/links' page answer exactly as the API writes it. */
function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [item()],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    ...overrides,
  };
}

describe("parsePerformanceLinksParams", () => {
  it("reads the page, the creators and the platforms out of the address", () => {
    expect(
      parsePerformanceLinksParams({
        page: "2",
        creator: `${CREATOR_A},${CREATOR_B}`,
        platform: "instagram,tiktok",
      }),
    ).toEqual({
      page: 2,
      creator: [CREATOR_A, CREATOR_B],
      platform: ["instagram", "tiktok"],
      q: "",
    });
  });

  // I3.2 (SCRUM-279): the search box's text, as Content Plan reads its own.
  it.each([
    ["trimmed", "  rani kopi  ", "rani kopi"],
    ["the first of a repeated one", ["rani", "kopi"], "rani"],
    ["none when only spaces", "   ", ""],
  ])("reads the search, %s", (_label, q, searched) => {
    expect(parsePerformanceLinksParams({ q }).q).toBe(searched);
  });

  it("keeps only the platforms the app lists, and falls back to the first page", () => {
    expect(parsePerformanceLinksParams({ platform: "youtube,instagram", page: "0" })).toEqual({
      page: 1,
      creator: [],
      platform: ["instagram"],
      q: "",
    });
  });

  it("reads a repeated parameter as every value of it", () => {
    expect(parsePerformanceLinksParams({ platform: ["tiktok", "instagram"] }).platform).toEqual([
      "tiktok",
      "instagram",
    ]);
  });
});

describe("buildPerformanceLinksQuery", () => {
  it("leaves the defaults out, so the bare view stays at the bare address", () => {
    const state = parsePerformanceLinksParams({});

    expect(buildPerformanceLinksQuery(state)).toEqual({});
    expect(performanceLinksHref(state)).toBe(PERFORMANCE_LINKS_BASE);
  });

  it("sends the picks comma-separated and the page only past the first", () => {
    const state = parsePerformanceLinksParams({
      creator: `${CREATOR_A},${CREATOR_B}`,
      platform: "instagram,tiktok",
      page: "3",
    });

    expect(buildPerformanceLinksQuery(state)).toEqual({
      creator: `${CREATOR_A},${CREATOR_B}`,
      platform: "instagram,tiktok",
      page: "3",
    });
    expect(performanceLinksHref(state)).toBe(
      `${PERFORMANCE_LINKS_BASE}?creator=${CREATOR_A}%2C${CREATOR_B}&platform=instagram%2Ctiktok&page=3`,
    );
  });

  // The pagination's links keep the search, so page 2 is page 2 of what was searched.
  it("keeps the search in the page's own address", () => {
    const state = parsePerformanceLinksParams({ q: "rani", page: "2" });

    expect(buildPerformanceLinksQuery(state)).toEqual({ q: "rani", page: "2" });
    expect(performanceLinksHref(state)).toBe(`${PERFORMANCE_LINKS_BASE}?q=rani&page=2`);
  });

  it("does not change the state it was given", () => {
    const given = parsePerformanceLinksParams({ creator: CREATOR_A, page: "2" });
    const before = structuredClone(given);

    buildPerformanceLinksQuery(given);
    performanceLinksHref(given);

    expect(given).toEqual(before);
  });
});

describe("toPerformanceLinksQuery", () => {
  it("sends each pick as its own parameter, the way the API reads a list", () => {
    const query = toPerformanceLinksQuery(
      parsePerformanceLinksParams({
        creator: `${CREATOR_A},${CREATOR_B}`,
        platform: "instagram,tiktok",
        page: "2",
      }),
    );

    expect(query.getAll("creator")).toEqual([CREATOR_A, CREATOR_B]);
    expect(query.getAll("platform")).toEqual(["instagram", "tiktok"]);
    expect(query.get("page")).toBe("2");
  });

  it("sends the search for the API to find, and none while the box is empty", () => {
    expect(toPerformanceLinksQuery(parsePerformanceLinksParams({ q: "rani kopi" })).get("q")).toBe(
      "rani kopi",
    );
    expect(toPerformanceLinksQuery(parsePerformanceLinksParams({})).has("q")).toBe(false);
  });

  // The API answers 400 past 100 characters (OWASP A05: only what the page parsed is sent).
  it("sends at most the 100 characters the API takes for a search", () => {
    const query = toPerformanceLinksQuery(parsePerformanceLinksParams({ q: "a".repeat(150) }));

    expect(query.get("q")).toBe("a".repeat(100));
  });

  it("sends a pick named twice only once, and always names the page", () => {
    const query = toPerformanceLinksQuery(
      parsePerformanceLinksParams({ creator: `${CREATOR_A},${CREATOR_A}` }),
    );

    expect(query.getAll("creator")).toEqual([CREATOR_A]);
    expect(query.get("page")).toBe("1");
  });

  it("sends at most the number of values the API takes for one filter", () => {
    const many = Array.from(
      { length: 51 },
      (_unused, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    const query = toPerformanceLinksQuery(parsePerformanceLinksParams({ creator: many.join(",") }));

    expect(query.getAll("creator")).toHaveLength(50);
  });
});

describe("toPerformanceLinksPage", () => {
  it("reads the API's page answer into the list's rows", () => {
    expect(toPerformanceLinksPage(answer())).toEqual({
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
          manualBy: null,
        },
      ],
      page: 1,
      pageSize: PERFORMANCE_PAGE_SIZE,
      total: 1,
      totalPages: 1,
    });
  });

  it("keeps an empty number as no data and a link's empty platform as none (AC 2)", () => {
    const page = toPerformanceLinksPage(
      answer({
        items: [item({ platform: null, views: null, state: "waiting", lastSyncedAt: null })],
      }),
    );

    expect(page.items[0]).toEqual(item({ platform: null, views: null, state: "waiting", lastSyncedAt: null }));
  });

  it("names the admin who filled a link in by email", () => {
    const page = toPerformanceLinksPage(
      answer({
        items: [item({ state: "manual", manualAt: "2026-11-02T03:00:00.000Z", manualBy: "sinta.admin@tofly.id" })],
      }),
    );

    expect(page.items[0].manualBy).toBe("sinta.admin@tofly.id");
  });

  it.each([
    ["no items at all", {}],
    ["a page of totals that are not whole numbers", answer({ totalPages: 1.5 })],
    ["a row that is not a record", answer({ items: ["not a row"] })],
    ["a state outside the six", answer({ items: [item({ state: "pending" })] })],
    ["a platform outside the two", answer({ items: [item({ platform: "youtube" })] })],
    ["a number written as text", answer({ items: [item({ views: "12400" })] })],
    ["a number below zero", answer({ items: [item({ likes: -1 })] })],
    ["a link without an id", answer({ items: [item({ linkId: undefined })] })],
    ["an admin named by something other than text", answer({ items: [item({ manualBy: 7 })] })],
  ])("refuses an answer that is not the API's page (%s)", (_label, raw) => {
    expect(() => toPerformanceLinksPage(raw)).toThrow(PerformanceLinksError);
  });
});

describe("the two list addresses", () => {
  it("names where every creator's links and the session's own are read from", () => {
    expect(PERFORMANCE_LINKS_PATH).toBe("/performance/links");
    expect(MY_PERFORMANCE_LINKS_PATH).toBe("/me/performance/links");
    expect(PERFORMANCE_PAGE_SIZE).toBe(10);
  });
});
