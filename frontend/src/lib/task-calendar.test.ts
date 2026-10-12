import type { ContentType } from "./contents";
import type { ContentStatus, ContentTag } from "./creators";
import {
  CALENDAR_GROUPS,
  calendarChipLabel,
  calendarGroup,
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
} from "./task-calendar";

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

describe("WEEKDAYS", () => {
  it("starts the week on Sunday, as the calendar's header reads", () => {
    expect(WEEKDAYS).toEqual(["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]);
  });
});

describe("monthGrid", () => {
  const OCTOBER = { year: 2026, month: 10 };
  const TODAY = "2026-10-09";

  function due(deadline: string, id = deadline) {
    return { id, deadline };
  }

  /** The grid as day numbers, with a dot for each empty cell. */
  function shape(month: { year: number; month: number }) {
    return monthGrid(month, [], TODAY).map((cell) => (cell ? cell.date : "."));
  }

  it("leaves the cells before the 1st empty: October 2026 starts on a Thursday", () => {
    const grid = shape(OCTOBER);

    expect(grid.slice(0, 5)).toEqual([".", ".", ".", ".", 1]);
    expect(grid.at(-1)).toBe(31);
    expect(grid).toHaveLength(35);
  });

  it("has no empty cell before the 1st when the month starts on a Sunday", () => {
    const grid = shape({ year: 2026, month: 2 });

    expect(grid[0]).toBe(1);
    expect(grid).toHaveLength(28);
  });

  it("gives February 29 days in a leap year", () => {
    const days = shape({ year: 2028, month: 2 }).filter((cell) => cell !== ".");

    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe(29);
  });

  it("gives February 28 days in a common year", () => {
    expect(shape({ year: 2026, month: 2 }).filter((cell) => cell !== ".")).toHaveLength(28);
  });

  it("needs six rows for a 31-day month that starts on a Saturday", () => {
    const grid = shape({ year: 2026, month: 8 });

    expect(grid.slice(0, 7)).toEqual([".", ".", ".", ".", ".", ".", 1]);
    expect(grid).toHaveLength(42);
  });

  it.each([
    [2026, 10],
    [2026, 2],
    [2028, 2],
    [2026, 8],
    [2026, 12],
    [2027, 1],
  ])("lays %i-%i out in whole weeks, filling the end of the last row", (year, month) => {
    expect(shape({ year, month }).length % 7).toBe(0);
  });

  it("names each cell by its calendar day", () => {
    const cells = monthGrid(OCTOBER, [], TODAY).filter((cell) => cell !== null);

    expect(cells[0].day).toBe("2026-10-01");
    expect(cells[8].day).toBe("2026-10-09");
    expect(cells.at(-1)?.day).toBe("2026-10-31");
  });

  it("puts a task on its deadline day", () => {
    const cells = monthGrid(OCTOBER, [due("2026-10-12")], TODAY).filter((cell) => cell !== null);

    expect(cells[11].tasks).toEqual([due("2026-10-12")]);
    expect(cells.filter((cell) => cell.tasks.length > 0)).toHaveLength(1);
  });

  it("keeps tasks that share a day in the order they were given", () => {
    const first = due("2026-10-12", "first");
    const second = due("2026-10-12", "second");

    const cells = monthGrid(OCTOBER, [first, second], TODAY).filter((cell) => cell !== null);

    expect(cells[11].tasks).toEqual([first, second]);
  });

  it.each([
    ["the month before", "2026-09-30"],
    ["the month after", "2026-11-01"],
    ["the same month of another year", "2025-10-12"],
    ["a deadline that is not a calendar day", "segera"],
    ["an empty deadline", ""],
  ])("places nothing for a task due in %s", (_label, deadline) => {
    const cells = monthGrid(OCTOBER, [due(deadline)], TODAY).filter((cell) => cell !== null);

    expect(cells.every((cell) => cell.tasks.length === 0)).toBe(true);
  });

  it("marks only today's cell as today", () => {
    const cells = monthGrid(OCTOBER, [], TODAY).filter((cell) => cell !== null);

    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.day)).toEqual(["2026-10-09"]);
  });

  it("marks no cell as today when another month is shown", () => {
    const cells = monthGrid({ year: 2026, month: 11 }, [], TODAY).filter((cell) => cell !== null);

    expect(cells.some((cell) => cell.isToday)).toBe(false);
  });
});

describe("shiftMonth", () => {
  it("moves to the next and the previous month", () => {
    expect(shiftMonth({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth({ year: 2026, month: 10 }, -1)).toEqual({ year: 2026, month: 9 });
  });

  it("goes from December into January of the next year", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("goes from January back into December of the year before", () => {
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it("stays put when asked to move by nothing", () => {
    expect(shiftMonth({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10 });
  });
});

describe("monthLabel", () => {
  it.each([
    [{ year: 2026, month: 10 }, "Oktober 2026"],
    [{ year: 2027, month: 1 }, "Januari 2027"],
    [{ year: 2028, month: 2 }, "Februari 2028"],
  ])("reads the month in Indonesian", (month, label) => {
    expect(monthLabel(month)).toBe(label);
  });
});

describe("calendarChipLabel", () => {
  function chip(
    name: string,
    type: ContentType,
    status: ContentStatus = "scheduled",
    tags: ContentTag[] = [],
  ) {
    return { name, type, status, tags };
  }

  it.each([
    ["Evg_10_RanggaPratama_07112026", "Evergreen #10"],
    ["Evg_1_SalsaBila_12102026", "Evergreen #1"],
    ["Evg_123_RanggaPratama_01012027", "Evergreen #123"],
  ])("shortens the Evergreen content %s to its number", (name, label) => {
    expect(calendarChipLabel(chip(name, "evergreen"))).toBe(label);
  });

  it("reads a Specific content as its full name", () => {
    expect(calendarChipLabel(chip("Tutorial Latihan Listening", "specific"))).toBe(
      "Tutorial Latihan Listening",
    );
  });

  it.each([
    ["no number", "Evg_RanggaPratama"],
    ["a different prefix", "Evergreen_10_RanggaPratama"],
    ["nothing after the number", "Evg_10"],
    ["a free-form name", "Konten rutin mingguan"],
  ])("falls back to the full name for an Evergreen content with %s", (_label, name) => {
    expect(calendarChipLabel(chip(name, "evergreen"))).toBe(name);
  });

  it("keeps the full name of a Specific content that happens to be named like an Evergreen one", () => {
    expect(calendarChipLabel(chip("Evg_10_RanggaPratama_07112026", "specific"))).toBe(
      "Evg_10_RanggaPratama_07112026",
    );
  });

  it("puts a mark in front of an overdue task", () => {
    expect(calendarChipLabel(chip("Tutorial Latihan Listening", "specific", "scheduled", ["overdue"]))).toBe(
      "! Tutorial Latihan Listening",
    );
    expect(
      calendarChipLabel(chip("Evg_10_RanggaPratama_07112026", "evergreen", "draft_revision", ["overdue"])),
    ).toBe("! Evergreen #10");
  });

  it("puts no mark on a finished task whose link came in late: it is done, not overdue", () => {
    expect(
      calendarChipLabel(
        chip("Tutorial Latihan Listening", "specific", "link_submitted", ["late_submission"]),
      ),
    ).toBe("Tutorial Latihan Listening");
  });
});
