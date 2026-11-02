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
    });
  });

  it("keeps only the platforms the app lists, and falls back to the first page", () => {
    expect(parsePerformanceLinksParams({ platform: "youtube,instagram", page: "0" })).toEqual({
      page: 1,
      creator: [],
      platform: ["instagram"],
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

  it("does not change the state it was given", () => {
    const given = parsePerformanceLinksParams({ creator: CREATOR_A, page: "2" });
    const before = structuredClone(given);

    buildPerformanceLinksQuery(given);
    performanceLinksHref(given);

    expect(given).toEqual(before);
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

  it.each([
    ["no items at all", {}],
    ["a page of totals that are not whole numbers", answer({ totalPages: 1.5 })],
    ["a row that is not a record", answer({ items: ["not a row"] })],
    ["a state outside the six", answer({ items: [item({ state: "pending" })] })],
    ["a platform outside the two", answer({ items: [item({ platform: "youtube" })] })],
    ["a number written as text", answer({ items: [item({ views: "12400" })] })],
    ["a number below zero", answer({ items: [item({ likes: -1 })] })],
    ["a link without an id", answer({ items: [item({ linkId: undefined })] })],
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
