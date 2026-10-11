import { parseTaskView, TASK_VIEWS, taskViewHref } from "./task-view";

describe("TASK_VIEWS", () => {
  it("offers the table first, then the calendar", () => {
    expect(TASK_VIEWS.map((view) => view.key)).toEqual(["table", "calendar"]);
  });

  it("labels the two views the way the switch reads", () => {
    expect(TASK_VIEWS.map((view) => view.label)).toEqual(["Tabel", "Kalender"]);
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

describe("taskViewHref", () => {
  it("leads to the bare Task Saya address for the table", () => {
    expect(taskViewHref("table", null)).toBe("/creator/tasks");
  });

  it("names the calendar in the address", () => {
    expect(taskViewHref("calendar", null)).toBe("/creator/tasks?view=calendar");
  });

  it("keeps the status filter when switching to the calendar", () => {
    expect(taskViewHref("calendar", "scheduled")).toBe(
      "/creator/tasks?status=scheduled&view=calendar",
    );
  });

  it("keeps the status filter when switching back to the table", () => {
    expect(taskViewHref("table", "draft_revision")).toBe("/creator/tasks?status=draft_revision");
  });

  it("never carries a page number, so a switch of view starts from the first page", () => {
    expect(taskViewHref("table", "scheduled")).not.toContain("page=");
    expect(taskViewHref("calendar", "scheduled")).not.toContain("page=");
  });

  it("gives back an address parseTaskView reads as the same view", () => {
    for (const { key } of TASK_VIEWS) {
      const query = new URL(taskViewHref(key, null), "http://localhost").searchParams;

      expect(parseTaskView(Object.fromEntries(query))).toBe(key);
    }
  });
});
