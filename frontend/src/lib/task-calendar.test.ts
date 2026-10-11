import type { ContentStatus, ContentTag } from "./creators";
import { CALENDAR_GROUPS, calendarGroup } from "./task-calendar";

function task(status: ContentStatus, tags: ContentTag[] = []) {
  return { status, tags };
}

const EVERY_STATUS: ContentStatus[] = [
  "pending",
  "scheduled",
  "draft_review",
  "draft_revision",
  "draft_approved",
  "link_submitted",
];

describe("CALENDAR_GROUPS", () => {
  it("lists the four groups in the legend's order", () => {
    expect(CALENDAR_GROUPS.map((group) => group.key)).toEqual(["todo", "wait", "done", "overdue"]);
  });

  it("names each group the way the legend reads", () => {
    expect(CALENDAR_GROUPS.map((group) => group.label)).toEqual([
      "Perlu Dikerjakan",
      "Menunggu Admin",
      "Selesai",
      "Overdue",
    ]);
  });

  it("gives each group its own colour", () => {
    expect(CALENDAR_GROUPS.map((group) => group.tone)).toEqual([
      "amber",
      "neutral",
      "green",
      "red",
    ]);
  });
});

describe("calendarGroup", () => {
  it.each(["scheduled", "draft_revision", "draft_approved"] as const)(
    "puts %s under Perlu Dikerjakan: the creator has to act",
    (status) => {
      expect(calendarGroup(task(status))).toBe("todo");
    },
  );

  it.each(["pending", "draft_review"] as const)(
    "puts %s under Menunggu Admin: the admin has to act",
    (status) => {
      expect(calendarGroup(task(status))).toBe("wait");
    },
  );

  it("puts a submitted link under Selesai", () => {
    expect(calendarGroup(task("link_submitted"))).toBe("done");
  });

  it.each(["scheduled", "draft_review", "draft_revision", "draft_approved"] as const)(
    "puts a %s task tagged overdue under Overdue, whatever its status",
    (status) => {
      expect(calendarGroup(task(status, ["overdue"]))).toBe("overdue");
    },
  );

  it("keeps a finished task under Selesai even when its link came in late", () => {
    expect(calendarGroup(task("link_submitted", ["late_submission"]))).toBe("done");
  });

  it("is not moved by the approval-bypassed tag, which says nothing about the deadline", () => {
    expect(calendarGroup(task("link_submitted", ["approval_bypassed"]))).toBe("done");
    expect(calendarGroup(task("scheduled", ["approval_bypassed"]))).toBe("todo");
  });

  it("finds overdue among several tags", () => {
    expect(calendarGroup(task("draft_revision", ["approval_bypassed", "overdue"]))).toBe("overdue");
  });

  it("places every status in exactly one of the legend's groups", () => {
    const keys = CALENDAR_GROUPS.map((group) => group.key);

    for (const status of EVERY_STATUS) {
      expect(keys).toContain(calendarGroup(task(status)));
    }
  });
});
