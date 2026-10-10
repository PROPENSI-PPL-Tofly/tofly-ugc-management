import {
  CONTENT_PLAN_BASE,
  CONTENT_PLAN_EMPTY,
  CONTENT_PLAN_TABS,
  DEFAULT_SORT,
  buildContentPlanQuery,
  contentPlanHref,
  isFiltered,
  needsReview,
  parseContentPlanParams,
  statusInTab,
  statusOptionsFor,
  tabDef,
  contentPlanAfterFilterChange,
  contentPlanAfterTabChange,
  type ContentPlanParams,
} from "./content-plan";

const FULL: ContentPlanParams = {
  tab: "all",
  page: 1,
  q: "",
  creator: [],
  type: [],
  status: [],
  overdue: "all",
  period: "all",
  from: "",
  to: "",
  sort: "desc",
};

describe("CONTENT_PLAN_TABS", () => {
  it("orders the four tabs the prototype orders them", () => {
    expect(CONTENT_PLAN_TABS.map((tab) => tab.key)).toEqual([
      "all",
      "action",
      "waiting",
      "done",
    ]);
    expect(CONTENT_PLAN_TABS.map((tab) => tab.label)).toEqual([
      "Semua",
      "Perlu Approval",
      "Menunggu Kreator",
      "Selesai",
    ]);
  });

  it("gives Perlu Approval the pending proposals and drafts waiting for review", () => {
    expect(tabDef("action").statuses).toEqual(["pending", "draft_review"]);
  });

  it("gives Menunggu Kreator the three statuses the ball is back with the creator on", () => {
    expect(tabDef("waiting").statuses).toEqual([
      "scheduled",
      "draft_revision",
      "draft_approved",
    ]);
  });

  it("gives Selesai the finished status and Semua no status filter", () => {
    expect(tabDef("done").statuses).toEqual(["link_submitted"]);
    expect(tabDef("all").statuses).toBeNull();
  });

  it("marks only Perlu Approval urgent so only its counter turns red", () => {
    expect(CONTENT_PLAN_TABS.filter((tab) => tab.urgent).map((tab) => tab.key)).toEqual([
      "action",
    ]);
    expect(CONTENT_PLAN_TABS.filter((tab) => tab.counter).map((tab) => tab.key)).toEqual([
      "action",
      "waiting",
    ]);
  });
});

describe("statusInTab", () => {
  it("puts a pending proposal and a draft under review in Perlu Approval", () => {
    expect(statusInTab("action", "pending")).toBe(true);
    expect(statusInTab("action", "draft_review")).toBe(true);
  });

  it("keeps scheduled, revision and approved work in Menunggu Kreator", () => {
    for (const status of ["scheduled", "draft_revision", "draft_approved"] as const) {
      expect(statusInTab("waiting", status)).toBe(true);
    }
  });

  it("puts link_submitted in Selesai and nothing else", () => {
    expect(statusInTab("done", "link_submitted")).toBe(true);
    expect(statusInTab("done", "draft_review")).toBe(false);
  });

  it("lets Semua hold every status", () => {
    for (const status of [
      "pending",
      "scheduled",
      "draft_review",
      "draft_revision",
      "draft_approved",
      "link_submitted",
    ] as const) {
      expect(statusInTab("all", status)).toBe(true);
    }
  });
});

describe("needsReview", () => {
  it("asks for a review only where Perlu Approval puts a status", () => {
    expect(needsReview("pending")).toBe(true);
    expect(needsReview("draft_review")).toBe(true);
    expect(needsReview("scheduled")).toBe(false);
    expect(needsReview("draft_revision")).toBe(false);
    expect(needsReview("draft_approved")).toBe(false);
    expect(needsReview("link_submitted")).toBe(false);
  });
});

describe("statusOptionsFor", () => {
  it("offers only the statuses that tab can hold", () => {
    expect(statusOptionsFor("action")).toEqual(["pending", "draft_review"]);
    expect(statusOptionsFor("waiting")).toEqual([
      "scheduled",
      "draft_revision",
      "draft_approved",
    ]);
    expect(statusOptionsFor("done")).toEqual(["link_submitted"]);
  });

  it("offers every status on Semua", () => {
    expect(statusOptionsFor("all")).toHaveLength(6);
  });
});

describe("parseContentPlanParams", () => {
  it("reads nothing as the bare first page sorted farthest first", () => {
    expect(parseContentPlanParams({})).toEqual(FULL);
  });

  it("reads each tab by its key and falls back to Semua for a value it cannot hold", () => {
    expect(parseContentPlanParams({ tab: "action" }).tab).toBe("action");
    expect(parseContentPlanParams({ tab: ["waiting"] }).tab).toBe("waiting");
    expect(parseContentPlanParams({ tab: "draft" }).tab).toBe("all");
    expect(tabDef("draft" as never).key).toBe("all");
  });

  it("keeps a positive integer page and drops anything else back to one", () => {
    expect(parseContentPlanParams({ page: "3" }).page).toBe(3);
    for (const bad of ["abc", "0", "-1", "1.5", "", undefined]) {
      expect(parseContentPlanParams({ page: bad }).page).toBe(1);
    }
  });

  it("trims the search and takes the first value when repeated", () => {
    expect(parseContentPlanParams({ q: "  salsa  " }).q).toBe("salsa");
    expect(parseContentPlanParams({ q: ["a", "b"] }).q).toBe("a");
  });

  it("reads a comma-separated creator list, trimming each part", () => {
    expect(parseContentPlanParams({ creator: "id-1, id-2 ,id-3" }).creator).toEqual([
      "id-1",
      "id-2",
      "id-3",
    ]);
  });

  it("keeps only real content types in the type list", () => {
    expect(parseContentPlanParams({ type: "evergreen,banana,specific" }).type).toEqual([
      "evergreen",
      "specific",
    ]);
  });

  it("keeps only real statuses in the status list", () => {
    expect(
      parseContentPlanParams({ status: "pending,junk,draft_review" }).status,
    ).toEqual(["pending", "draft_review"]);
  });

  it("reads the overdue and period selects, falling back to all", () => {
    expect(parseContentPlanParams({ overdue: "yes" }).overdue).toBe("yes");
    expect(parseContentPlanParams({ overdue: "maybe" }).overdue).toBe("all");
    expect(parseContentPlanParams({ period: "next30" }).period).toBe("next30");
    expect(parseContentPlanParams({ period: "someday" }).period).toBe("all");
  });

  it("keeps a calendar day per custom-range end and drops anything else", () => {
    const params = { period: "custom", from: "2026-10-01", to: "nonsense" };
    expect(parseContentPlanParams(params)).toMatchObject({
      from: "2026-10-01",
      to: "",
    });
    expect(parseContentPlanParams({ to: [] }).to).toBe("");
    expect(parseContentPlanParams({ period: "custom", to: "2026-10-31" }).to).toBe("2026-10-31");
  });

  it("reads a sort direction and falls back to the default for anything else", () => {
    expect(parseContentPlanParams({ sort: "asc" }).sort).toBe("asc");
    expect(parseContentPlanParams({ sort: "sideways" }).sort).toBe("desc");
  });
});

describe("buildContentPlanQuery", () => {
  it("leaves the bare view with no parameters at all", () => {
    expect(buildContentPlanQuery(FULL)).toEqual({});
  });

  it("keeps a tab, a search and a sort that is not the default", () => {
    expect(
      buildContentPlanQuery({ ...FULL, tab: "action", q: "salsa", sort: "asc" }),
    ).toEqual({ tab: "action", q: "salsa", sort: "asc" });
  });

  it("joins the multi-selects with commas", () => {
    expect(
      buildContentPlanQuery({
        ...FULL,
        creator: ["id-1", "id-2"],
        type: ["evergreen"],
        status: ["pending", "draft_review"],
      }),
    ).toEqual({
      creator: "id-1,id-2",
      type: "evergreen",
      status: "pending,draft_review",
    });
  });

  it("keeps a page past the first and the custom-range dates", () => {
    expect(
      buildContentPlanQuery({
        ...FULL,
        page: 4,
        period: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toEqual({ page: "4", period: "custom", from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("contentPlanHref", () => {
  it("leads to the bare page when nothing is set", () => {
    expect(contentPlanHref(FULL)).toBe(CONTENT_PLAN_BASE);
  });

  it("carries the state after a question mark", () => {
    expect(contentPlanHref({ ...FULL, tab: "waiting", page: 2 })).toBe(
      `${CONTENT_PLAN_BASE}?tab=waiting&page=2`,
    );
  });
});

describe("isFiltered", () => {
  it("is false for the bare view and true once anything narrows it", () => {
    expect(isFiltered(FULL)).toBe(false);
    expect(isFiltered({ ...FULL, q: "x" })).toBe(true);
    expect(isFiltered({ ...FULL, creator: ["id-1"] })).toBe(true);
    expect(isFiltered({ ...FULL, type: ["specific"] })).toBe(true);
    expect(isFiltered({ ...FULL, status: ["pending"] })).toBe(true);
    expect(isFiltered({ ...FULL, overdue: "yes" })).toBe(true);
    expect(isFiltered({ ...FULL, period: "month" })).toBe(true);
    expect(isFiltered({ ...FULL, sort: "asc" })).toBe(false);
    expect(isFiltered({ ...FULL, page: 3 })).toBe(false);
  });
});

describe("contentPlanAfterFilterChange", () => {
  it("applies the patch and sends the view back to its first page", () => {
    const next = contentPlanAfterFilterChange({ ...FULL, page: 5, q: "old" }, { q: "new" });
    expect(next).toEqual({ ...FULL, q: "new", page: 1 });
  });
});

describe("contentPlanAfterTabChange", () => {
  it("keeps the search and filters but drops the status picks, the sort and the page", () => {
    const state: ContentPlanParams = {
      tab: "all",
      page: 3,
      q: "salsa",
      creator: ["id-1"],
      type: ["evergreen"],
      status: ["pending"],
      overdue: "yes",
      period: "month",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "asc",
    };
    expect(contentPlanAfterTabChange(state, "action")).toEqual({
      ...state,
      tab: "action",
      status: [],
      sort: DEFAULT_SORT,
      page: 1,
    });
  });
});

describe("CONTENT_PLAN_EMPTY", () => {
  it("words each tab's emptiness the way the prototype words it", () => {
    expect(CONTENT_PLAN_EMPTY.action).toBe("Tidak ada yang perlu di-approve.");
    expect(CONTENT_PLAN_EMPTY.waiting).toBe("Tidak ada konten yang menunggu kreator.");
    expect(CONTENT_PLAN_EMPTY.done).toBe("Belum ada konten selesai.");
    expect(CONTENT_PLAN_EMPTY.all).toBe("Belum ada konten.");
  });
});
