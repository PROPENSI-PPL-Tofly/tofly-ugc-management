import { DEFAULT_MY_TASKS_PARAMS, type MyTasksParams } from "./my-tasks";
import { calendarParams, parseTaskView, TASK_VIEWS, taskViewHref, taskViewParams } from "./task-view";

const BARE = DEFAULT_MY_TASKS_PARAMS;

function on(state: Partial<MyTasksParams>): MyTasksParams {
  return { ...DEFAULT_MY_TASKS_PARAMS, ...state };
}

describe("TASK_VIEWS", () => {
  it("offers the table first, then the calendar", () => {
    expect(TASK_VIEWS.map((view) => view.key)).toEqual(["table", "calendar"]);
  });

  it("labels the two views the way the switch reads", () => {
    expect(TASK_VIEWS.map((view) => view.label)).toEqual(["Tabel", "Kalender"]);
  });
});

describe("calendarParams", () => {
  it("drops the period and its days, which the calendar has no use for", () => {
    const state = on({ tab: "waiting", overdue: "no", period: "custom", from: "2026-10-01", to: "2026-10-31" });

    expect(calendarParams(state)).toEqual(on({ tab: "waiting", overdue: "no" }));
  });

  it("leaves a state without a period as it was", () => {
    expect(calendarParams(BARE)).toEqual(BARE);
  });
});

describe("parseTaskView", () => {
  it("shows the table when the address names no view", () => {
    expect(parseTaskView({})).toBe("table");
  });

  it("shows the calendar when the address asks for it", () => {
    expect(parseTaskView({ view: "calendar" })).toBe("calendar");
  });

  it("shows the table when the address asks for it by name", () => {
    expect(parseTaskView({ view: "table" })).toBe("table");
  });

  it.each([
    ["a view it does not know", "grid"],
    ["an empty value", ""],
    ["the right word in the wrong case", "Calendar"],
    ["a value with spaces around it", " calendar "],
  ])("falls back to the table for %s", (_label, view) => {
    expect(parseTaskView({ view })).toBe("table");
  });

  it("reads the first value when the view is sent more than once", () => {
    expect(parseTaskView({ view: ["calendar", "table"] })).toBe("calendar");
    expect(parseTaskView({ view: ["grid", "calendar"] })).toBe("table");
  });

  it("is not moved by the other things the address carries", () => {
    expect(parseTaskView({ status: "scheduled", page: "2" })).toBe("table");
    expect(parseTaskView({ status: "scheduled", view: "calendar" })).toBe("calendar");
  });
});

describe("taskViewParams", () => {
  it("adds nothing for the table, which the bare address already shows", () => {
    expect(taskViewParams("table")).toEqual({});
  });

  it("names the calendar", () => {
    expect(taskViewParams("calendar")).toEqual({ view: "calendar" });
  });
});

describe("taskViewHref", () => {
  it("leads to the bare Task Saya address for the table", () => {
    expect(taskViewHref("table", BARE)).toBe("/creator/tasks");
  });

  it("names the calendar in the address", () => {
    expect(taskViewHref("calendar", BARE)).toBe("/creator/tasks?view=calendar");
  });

  it("keeps the status filter when switching to the calendar", () => {
    expect(taskViewHref("calendar", on({ status: ["scheduled"] }))).toBe(
      "/creator/tasks?status=scheduled&view=calendar",
    );
  });

  it("keeps the status filter when switching back to the table", () => {
    expect(taskViewHref("table", on({ status: ["draft_revision"] }))).toBe(
      "/creator/tasks?status=draft_revision",
    );
  });

  it("keeps the tab, the search and every filter on both views", () => {
    const state = on({
      tab: "action",
      q: "serum",
      type: ["evergreen"],
      status: ["scheduled", "draft_approved"],
      overdue: "yes",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "desc",
    });
    const kept =
      "tab=action&q=serum&type=evergreen&status=scheduled%2Cdraft_approved&overdue=yes" +
      "&period=custom&from=2026-10-01&to=2026-10-31&sort=desc";

    expect(taskViewHref("table", state)).toBe(`/creator/tasks?${kept}`);
    expect(taskViewHref("calendar", state)).toBe(
      "/creator/tasks?tab=action&q=serum&type=evergreen&status=scheduled%2Cdraft_approved" +
        "&overdue=yes&sort=desc&view=calendar",
    );
  });

  it("leaves the period behind on the way to the calendar, whose month is its scope", () => {
    expect(taskViewHref("calendar", on({ period: "next30" }))).toBe("/creator/tasks?view=calendar");
  });

  it("never carries a page number, so a switch of view starts from the first page", () => {
    const state = on({ status: ["scheduled"], page: 3 });

    expect(taskViewHref("table", state)).not.toContain("page=");
    expect(taskViewHref("calendar", state)).not.toContain("page=");
  });

  it("gives back an address parseTaskView reads as the same view", () => {
    for (const { key } of TASK_VIEWS) {
      const query = new URL(taskViewHref(key, BARE), "http://localhost").searchParams;

      expect(parseTaskView(Object.fromEntries(query))).toBe(key);
    }
  });
});
