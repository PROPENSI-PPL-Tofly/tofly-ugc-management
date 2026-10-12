import {
  DEFAULT_MY_TASKS_PARAMS,
  MY_TASK_TABS,
  MY_TASKS_EMPTY,
  MY_TASKS_FILTERED_EMPTY,
  MY_TASKS_PAGE_SIZE,
  buildMyTasksQuery,
  isMyTasksFiltered,
  myTabOf,
  myTasksAfterTabChange,
  parseMyTasksParams,
  myStatusOptionsFor,
  unknownStatuses,
  type MyTasksParams,
} from "./my-tasks";

describe("MY_TASKS_PAGE_SIZE", () => {
  it("shows ten tasks a page, the same as the admin Content Plan", () => {
    expect(MY_TASKS_PAGE_SIZE).toBe(10);
  });
});

describe("MY_TASK_TABS", () => {
  it("groups the creator's work by whose turn it is, with only Perlu Dikerjakan urgent", () => {
    expect(
      MY_TASK_TABS.map(({ key, label, statuses, urgent, counter }) => [key, label, statuses, urgent, counter]),
    ).toEqual([
      ["all", "Semua", null, false, false],
      ["action", "Perlu Dikerjakan", ["scheduled", "draft_revision", "draft_approved"], true, true],
      ["waiting", "Menunggu Admin", ["draft_review"], false, true],
      ["done", "Selesai", ["link_submitted"], false, false],
    ]);
  });

  it("says what each empty tab means, and one thing for an empty filter", () => {
    expect(MY_TASKS_EMPTY).toEqual({
      all: "Belum ada task.",
      action: "Tidak ada yang perlu dikerjakan.",
      waiting: "Tidak ada yang menunggu Admin.",
      done: "Belum ada task selesai.",
    });
    expect(MY_TASKS_FILTERED_EMPTY).toBe("Tidak ada konten sesuai filter.");
  });
});

describe("myStatusOptionsFor", () => {
  it("offers only the statuses a tab can hold, never a pending proposal", () => {
    expect(myStatusOptionsFor("all")).toEqual([
      "scheduled",
      "draft_review",
      "draft_revision",
      "draft_approved",
      "link_submitted",
    ]);
    expect(myStatusOptionsFor("waiting")).toEqual(["draft_review"]);
    expect(myStatusOptionsFor("done")).toEqual(["link_submitted"]);
  });

  // Perlu Dikerjakan also lists a draft in review once its H-1 link can be sent, so its filter
  // has to be able to name that row's status, after the tab's own.
  it("offers Draft Menunggu Review on Perlu Dikerjakan too, where an H-1 draft is listed", () => {
    expect(myStatusOptionsFor("action")).toEqual([
      "scheduled",
      "draft_revision",
      "draft_approved",
      "draft_review",
    ]);
  });

  it("keeps a draft in review's own tab Menunggu Admin, whatever else can list it", () => {
    expect(myTabOf("draft_review")).toBe("waiting");
  });
});

describe("parseMyTasksParams", () => {
  it("opens Semua on page one, nearest deadline first, with nothing narrowed", () => {
    expect(parseMyTasksParams({})).toEqual({
      tab: "all",
      page: 1,
      q: "",
      type: [],
      status: [],
      overdue: "all",
      period: "all",
      from: "",
      to: "",
      sort: "asc",
    });
    expect(DEFAULT_MY_TASKS_PARAMS).toEqual(parseMyTasksParams({}));
  });

  it("reads every parameter the page writes", () => {
    expect(
      parseMyTasksParams({
        tab: "action",
        page: "2",
        q: " serum ",
        type: "evergreen,specific",
        status: "scheduled,draft_revision",
        overdue: "yes",
        period: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
        sort: "desc",
      }),
    ).toEqual({
      tab: "action",
      page: 2,
      q: "serum",
      type: ["evergreen", "specific"],
      status: ["scheduled", "draft_revision"],
      overdue: "yes",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "desc",
    });
  });

  it.each([
    ["the admin's tab name", { tab: "needs_approval" }, { tab: "all" }],
    ["an unknown sort", { sort: "up" }, { sort: "asc" }],
    ["page zero", { page: "0" }, { page: 1 }],
    ["an unknown overdue value", { overdue: "maybe" }, { overdue: "all" }],
    ["an unknown period", { period: "week" }, { period: "all" }],
    ["a day that does not exist", { from: "2026-02-30" }, { from: "" }],
    ["an unknown type", { type: "optional,specific" }, { type: ["specific"] }],
    ["a pending proposal", { status: "pending,scheduled" }, { status: ["scheduled"] }],
  ])("falls back on %s", (_label, params, expected) => {
    expect(parseMyTasksParams(params)).toMatchObject(expected);
  });

  // A hand-typed or stale address could pair a tab with a status it never holds, which would
  // empty the list for no visible reason; the status filter cannot even offer it there.
  it("keeps Draft Menunggu Review on Perlu Dikerjakan, which lists an H-1 draft", () => {
    expect(
      parseMyTasksParams({ tab: "action", status: "draft_review,link_submitted" }).status,
    ).toEqual(["draft_review"]);
  });

  it("drops a status the open tab cannot hold", () => {
    expect(parseMyTasksParams({ tab: "waiting", status: "scheduled,draft_review" }).status).toEqual([
      "draft_review",
    ]);
  });

  it("reads the first of a repeated parameter", () => {
    expect(parseMyTasksParams({ tab: ["done", "all"] }).tab).toBe("done");
  });
});

describe("unknownStatuses", () => {
  it("names every status the page could not read, so it can say why it was ignored", () => {
    expect(unknownStatuses({ status: "pending,scheduled,draft_revised" })).toEqual([
      "pending",
      "draft_revised",
    ]);
    expect(unknownStatuses({})).toEqual([]);
  });
});

describe("buildMyTasksQuery", () => {
  it("leaves every default out, so the bare view keeps the bare address", () => {
    expect(buildMyTasksQuery(DEFAULT_MY_TASKS_PARAMS)).toEqual({});
  });

  it("writes every non-default part under the name the page reads it back by", () => {
    const state: MyTasksParams = {
      tab: "done",
      page: 3,
      q: "serum",
      type: ["specific"],
      status: ["link_submitted"],
      overdue: "no",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "desc",
    };

    const query = buildMyTasksQuery(state);

    expect(query).toEqual({
      tab: "done",
      q: "serum",
      type: "specific",
      status: "link_submitted",
      overdue: "no",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "desc",
      page: "3",
    });
    expect(parseMyTasksParams(query)).toEqual(state);
  });
});

describe("isMyTasksFiltered", () => {
  it("is false for the bare view, whatever the tab, sort or page", () => {
    expect(isMyTasksFiltered({ ...DEFAULT_MY_TASKS_PARAMS, tab: "done", sort: "desc", page: 2 })).toBe(false);
  });

  it.each([
    { q: "serum" },
    { type: ["specific" as const] },
    { status: ["scheduled" as const] },
    { overdue: "yes" as const },
    { period: "month" as const },
  ])("is true once %j narrows the list", (patch) => {
    expect(isMyTasksFiltered({ ...DEFAULT_MY_TASKS_PARAMS, ...patch })).toBe(true);
  });
});

describe("myTasksAfterTabChange", () => {
  it("carries the search and filters over, but drops the old tab's status picks, sort and page", () => {
    const state: MyTasksParams = {
      ...DEFAULT_MY_TASKS_PARAMS,
      q: "serum",
      type: ["specific"],
      overdue: "yes",
      period: "month",
      status: ["scheduled"],
      sort: "desc",
      page: 3,
    };

    expect(myTasksAfterTabChange(state, "waiting")).toEqual({
      ...state,
      tab: "waiting",
      status: [],
      sort: "asc",
      page: 1,
    });
  });
});

describe("myTabOf", () => {
  it.each([
    ["scheduled", "action"],
    ["draft_revision", "action"],
    ["draft_approved", "action"],
    ["draft_review", "waiting"],
    ["link_submitted", "done"],
  ] as const)("finds %s on the %s tab", (status, tab) => {
    expect(myTabOf(status)).toBe(tab);
  });

  it("names a tab that offers the status in its own filter", () => {
    for (const def of MY_TASK_TABS) {
      for (const status of def.statuses ?? []) {
        expect(myStatusOptionsFor(myTabOf(status))).toContain(status);
      }
    }
  });
});
