import { DEFAULT_CONTENT_PLAN_PARAMS, type ContentPlanParams } from "./content-plan";
import {
  MAX_FILTER_VALUES,
  toContentListQuery,
  toContentPlanResponse,
  type RawContentList,
} from "./content-list-api";

// GET /contents as subtask 5.1 (#80) reads and answers it. The page keeps its own, shorter
// vocabulary in the address bar; these tests pin the translation between the two, so a change
// to either side is a change here and in content-list-api.ts only.

const TODAY = "2026-10-10";
const CREATOR_A = "11111111-1111-4111-8111-111111111111";
const CREATOR_B = "22222222-2222-4222-8222-222222222222";

function state(overrides: Partial<ContentPlanParams> = {}): ContentPlanParams {
  return { ...DEFAULT_CONTENT_PLAN_PARAMS, ...overrides };
}

/** The query as text, the way it is appended to the endpoint's address. */
function query(overrides: Partial<ContentPlanParams> = {}, today = TODAY): string {
  return toContentListQuery(state(overrides), today).toString();
}

describe("toContentListQuery", () => {
  it("asks for nothing but the page when no tab, filter or sort is set", () => {
    expect(query()).toBe("page=1");
  });

  it("always names the page, whichever one is asked for", () => {
    expect(query({ page: 7 })).toBe("page=7");
  });

  describe("tab", () => {
    it.each([
      ["action", "needs_approval"],
      ["waiting", "waiting_creator"],
      ["done", "done"],
    ] as const)("sends the page's %s tab as the API's %s", (tab, sent) => {
      expect(toContentListQuery(state({ tab }), TODAY).get("tab")).toBe(sent);
    });

    it("leaves the tab out for Semua, which is the API's default", () => {
      expect(toContentListQuery(state({ tab: "all" }), TODAY).has("tab")).toBe(false);
    });
  });

  describe("search", () => {
    it("sends the search text", () => {
      expect(toContentListQuery(state({ q: "salsa" }), TODAY).get("q")).toBe("salsa");
    });

    it("cuts a search longer than the API accepts instead of earning a 400", () => {
      const sent = toContentListQuery(state({ q: "a".repeat(101) }), TODAY).get("q");

      expect(sent).toBe("a".repeat(100));
    });

    it("keeps a search of exactly the accepted length whole", () => {
      const sent = toContentListQuery(state({ q: "a".repeat(100) }), TODAY).get("q");

      expect(sent).toHaveLength(100);
    });
  });

  describe("multi-select filters", () => {
    it("sends each pick as its own parameter, the way the API reads a list", () => {
      const params = toContentListQuery(
        state({
          creator: [CREATOR_A, CREATOR_B],
          type: ["evergreen", "specific"],
          status: ["pending", "draft_review"],
        }),
        TODAY,
      );

      expect(params.getAll("creator")).toEqual([CREATOR_A, CREATOR_B]);
      expect(params.getAll("type")).toEqual(["evergreen", "specific"]);
      expect(params.getAll("status")).toEqual(["pending", "draft_review"]);
      expect(params.toString()).not.toContain("%2C");
    });

    it("sends a single pick once", () => {
      expect(query({ type: ["specific"] })).toBe("type=specific&page=1");
    });

    it("leaves a filter out entirely when nothing is picked", () => {
      const params = toContentListQuery(state(), TODAY);

      expect(params.has("creator")).toBe(false);
      expect(params.has("type")).toBe(false);
      expect(params.has("status")).toBe(false);
    });

    it("sends a pick named twice only once", () => {
      const params = toContentListQuery(state({ creator: [CREATOR_A, CREATOR_A] }), TODAY);

      expect(params.getAll("creator")).toEqual([CREATOR_A]);
    });

    it.each([
      ["a word", "rangga"],
      ["an id with something appended", `${CREATOR_A}' or 1=1`],
      ["a path", "../admin"],
    ])("drops a creator that is %s, which the API would refuse (OWASP A03)", (_label, bad) => {
      const params = toContentListQuery(state({ creator: [bad, CREATOR_B] }), TODAY);

      expect(params.getAll("creator")).toEqual([CREATOR_B]);
    });

    it("leaves the creator filter out when none of the picks is an id", () => {
      expect(toContentListQuery(state({ creator: ["x", "y"] }), TODAY).has("creator")).toBe(false);
    });

    it("accepts an id in capitals, as the API does", () => {
      const upper = CREATOR_A.toUpperCase();

      expect(toContentListQuery(state({ creator: [upper] }), TODAY).getAll("creator")).toEqual([
        upper,
      ]);
    });

    it("sends at most the number of values the API takes for one filter", () => {
      const many = Array.from(
        { length: MAX_FILTER_VALUES + 1 },
        (_unused, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      );

      const sent = toContentListQuery(state({ creator: many }), TODAY).getAll("creator");

      expect(sent).toHaveLength(MAX_FILTER_VALUES);
      expect(sent).toEqual(many.slice(0, MAX_FILTER_VALUES));
    });
  });

  describe("overdue", () => {
    it.each([
      ["yes", "true"],
      ["no", "false"],
    ] as const)("sends %s as %s", (overdue, sent) => {
      expect(toContentListQuery(state({ overdue }), TODAY).get("overdue")).toBe(sent);
    });

    it("leaves it out when both are wanted", () => {
      expect(toContentListQuery(state({ overdue: "all" }), TODAY).has("overdue")).toBe(false);
    });
  });

  describe("deadline sort", () => {
    it("asks for the nearest deadline first when the column is turned over", () => {
      expect(toContentListQuery(state({ sort: "asc" }), TODAY).get("sort")).toBe("deadline_asc");
    });

    it("leaves the sort out for furthest first, which is the API's default", () => {
      expect(toContentListQuery(state({ sort: "desc" }), TODAY).has("sort")).toBe(false);
    });
  });

  describe("period", () => {
    function range(overrides: Partial<ContentPlanParams>, today = TODAY) {
      const params = toContentListQuery(state(overrides), today);
      return [params.get("deadlineFrom"), params.get("deadlineTo")];
    }

    it("sends no range for every period", () => {
      expect(range({ period: "all" })).toEqual([null, null]);
    });

    it("ignores dates left over from a custom range once another period is picked", () => {
      expect(range({ period: "all", from: "2026-01-01", to: "2026-01-31" })).toEqual([null, null]);
    });

    it.each([
      ["a 31-day month", "2026-10-10", ["2026-10-01", "2026-10-31"]],
      ["a 30-day month", "2026-11-30", ["2026-11-01", "2026-11-30"]],
      ["February in a common year", "2027-02-01", ["2027-02-01", "2027-02-28"]],
      ["February in a leap year", "2028-02-15", ["2028-02-01", "2028-02-29"]],
      ["December, without spilling into January", "2026-12-31", ["2026-12-01", "2026-12-31"]],
    ])("spans this month for %s", (_label, today, expected) => {
      expect(range({ period: "month" }, today)).toEqual(expected);
    });

    it.each([
      ["within the year", "2026-10-10", ["2026-10-10", "2026-11-09"]],
      ["across the new year", "2026-12-15", ["2026-12-15", "2027-01-14"]],
    ])("spans today and the 30 days after it, %s", (_label, today, expected) => {
      expect(range({ period: "next30" }, today)).toEqual(expected);
    });

    it.each([
      ["within the year", "2026-10-10", ["2026-07-12", "2026-10-10"]],
      ["back across the new year", "2027-01-15", ["2026-10-17", "2027-01-15"]],
    ])("spans the 90 days before today and today, %s", (_label, today, expected) => {
      expect(range({ period: "last90" }, today)).toEqual(expected);
    });

    it("sends a custom range as picked", () => {
      expect(range({ period: "custom", from: "2026-09-01", to: "2026-09-30" })).toEqual([
        "2026-09-01",
        "2026-09-30",
      ]);
    });

    it("sends a one-day custom range, whose two ends are the same day", () => {
      expect(range({ period: "custom", from: "2026-09-15", to: "2026-09-15" })).toEqual([
        "2026-09-15",
        "2026-09-15",
      ]);
    });

    it.each([
      ["only a start", { from: "2026-09-01", to: "" }, ["2026-09-01", null]],
      ["only an end", { from: "", to: "2026-09-30" }, [null, "2026-09-30"]],
      ["neither end yet", { from: "", to: "" }, [null, null]],
    ])("leaves a custom range open with %s", (_label, picked, expected) => {
      expect(range({ period: "custom", ...picked })).toEqual(expected);
    });

    it("puts a custom range picked backwards in order, which the API would refuse", () => {
      expect(range({ period: "custom", from: "2026-09-30", to: "2026-09-01" })).toEqual([
        "2026-09-01",
        "2026-09-30",
      ]);
    });
  });

  it("puts everything together in the order the API documents", () => {
    expect(
      query({
        tab: "action",
        q: "salsa",
        creator: [CREATOR_A, CREATOR_B],
        type: ["specific"],
        status: ["pending", "draft_review"],
        overdue: "yes",
        period: "next30",
        sort: "asc",
        page: 2,
      }),
    ).toBe(
      `tab=needs_approval&q=salsa&creator=${CREATOR_A}&creator=${CREATOR_B}&type=specific` +
        "&status=pending&status=draft_review&overdue=true" +
        "&deadlineFrom=2026-10-10&deadlineTo=2026-11-09&sort=deadline_asc&page=2",
    );
  });

  it("does not change the state it was given", () => {
    const given = state({ creator: [CREATOR_B, CREATOR_A], period: "custom", from: "2026-09-30", to: "2026-09-01" });
    const before = structuredClone(given);

    toContentListQuery(given, TODAY);

    expect(given).toEqual(before);
  });
});

describe("toContentPlanResponse", () => {
  function raw(overrides: Partial<RawContentList> = {}): RawContentList {
    return {
      items: [
        {
          id: "content-1",
          name: "Promo Lebaran",
          creatorId: CREATOR_A,
          creatorName: "Rangga Pratama",
          type: "specific",
          deadline: "2026-10-12",
          status: "draft_review",
          tags: ["overdue"],
          revisionCount: 2,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 23,
      totalPages: 3,
      tabCounts: { all: 23, needs_approval: 4, waiting_creator: 12, done: 7 },
      ...overrides,
    };
  }

  it("names each row's id the way the page opens the detail panel by", () => {
    const [row] = toContentPlanResponse(raw()).items;

    expect(row).toEqual({
      contentId: "content-1",
      name: "Promo Lebaran",
      creatorId: CREATOR_A,
      creatorName: "Rangga Pratama",
      type: "specific",
      deadline: "2026-10-12",
      status: "draft_review",
      tags: ["overdue"],
      revisionCount: 2,
    });
  });

  it("puts each API counter under the page's tab", () => {
    expect(toContentPlanResponse(raw()).counts).toEqual({
      all: 23,
      action: 4,
      waiting: 12,
      done: 7,
    });
  });

  it("carries the totals over", () => {
    expect(toContentPlanResponse(raw())).toMatchObject({ total: 23, totalPages: 3 });
  });

  it("keeps the rows in the order the API sorted them", () => {
    const [first] = raw().items;
    const response = toContentPlanResponse(
      raw({ items: [{ ...first, id: "b" }, { ...first, id: "a" }, { ...first, id: "c" }] }),
    );

    expect(response.items.map((row) => row.contentId)).toEqual(["b", "a", "c"]);
  });

  it("answers an empty list as empty, with every counter at zero", () => {
    const response = toContentPlanResponse(
      raw({
        items: [],
        total: 0,
        totalPages: 1,
        tabCounts: { all: 0, needs_approval: 0, waiting_creator: 0, done: 0 },
      }),
    );

    expect(response).toEqual({
      items: [],
      total: 0,
      totalPages: 1,
      counts: { all: 0, action: 0, waiting: 0, done: 0 },
    });
  });

  it("reads a counter the API left out as zero, never as a blank on a tab", () => {
    const response = toContentPlanResponse(
      raw({ tabCounts: { all: 5 } as RawContentList["tabCounts"] }),
    );

    expect(response.counts).toEqual({ all: 5, action: 0, waiting: 0, done: 0 });
  });
});
