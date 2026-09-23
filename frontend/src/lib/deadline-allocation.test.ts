import {
  addManualDeadline,
  allocateDeadlines,
  NO_PICKS,
  removeManualDeadline,
  toggleAutoDeadline,
  type ScheduleBounds,
} from "./deadline-allocation";

// Contract 1 Okt – 31 Des, today 24 Sep, 5-day buffer: the first allowed day is 6 Okt.
const BOUNDS: ScheduleBounds = {
  autoDeadlines: ["2026-10-06", "2026-10-20"],
  quota: 3,
  firstAllowed: "2026-10-06",
  contractEnd: "2026-12-31",
};

describe("allocateDeadlines", () => {
  it("uses the auto deadlines and counts what is still missing", () => {
    expect(allocateDeadlines(BOUNDS, NO_PICKS)).toEqual({
      auto: ["2026-10-06", "2026-10-20"],
      manual: [],
      deadlines: ["2026-10-06", "2026-10-20"],
      remaining: 1,
    });
  });

  it("fills the gap with manual deadlines, all sent in date order", () => {
    const allocation = allocateDeadlines(BOUNDS, { removedAuto: [], manual: ["2026-10-13"] });

    expect(allocation.deadlines).toEqual(["2026-10-06", "2026-10-13", "2026-10-20"]);
    expect(allocation.remaining).toBe(0);
  });

  it("frees a content when an auto deadline is removed", () => {
    const allocation = allocateDeadlines(BOUNDS, { removedAuto: ["2026-10-06"], manual: [] });

    expect(allocation.auto).toEqual(["2026-10-20"]);
    expect(allocation.remaining).toBe(2);
  });

  it("allows more than one content on the same manual day", () => {
    const allocation = allocateDeadlines(
      { ...BOUNDS, autoDeadlines: [] },
      { removedAuto: [], manual: ["2026-11-02", "2026-11-02"] },
    );

    expect(allocation.deadlines).toEqual(["2026-11-02", "2026-11-02"]);
    expect(allocation.remaining).toBe(1);
  });

  // The contract or quota can change after dates were picked; stale picks must not be sent.
  it("drops manual deadlines that no longer fit the contract or the quota", () => {
    const allocation = allocateDeadlines(
      { ...BOUNDS, quota: 3 },
      { removedAuto: [], manual: ["2026-10-01", "2027-01-05", "2026-11-02", "2026-11-09"] },
    );

    expect(allocation.manual).toEqual(["2026-11-02"]);
    expect(allocation.remaining).toBe(0);
  });

  it("ignores removals of dates that are no longer auto deadlines", () => {
    expect(allocateDeadlines(BOUNDS, { removedAuto: ["2026-10-13"], manual: [] }).auto).toEqual([
      "2026-10-06",
      "2026-10-20",
    ]);
  });
});

describe("toggleAutoDeadline", () => {
  it("removes an auto deadline, then restores it", () => {
    const removed = toggleAutoDeadline(NO_PICKS, "2026-10-06");
    expect(removed.removedAuto).toEqual(["2026-10-06"]);

    expect(toggleAutoDeadline(removed, "2026-10-06").removedAuto).toEqual([]);
  });
});

describe("addManualDeadline", () => {
  it("adds a date while contents still need one", () => {
    expect(addManualDeadline(NO_PICKS, "2026-11-02", 1).manual).toEqual(["2026-11-02"]);
  });

  it("changes nothing once every content has a date", () => {
    const picks = { removedAuto: [], manual: ["2026-11-02"] };

    expect(addManualDeadline(picks, "2026-11-09", 0)).toBe(picks);
  });
});

describe("removeManualDeadline", () => {
  it("removes one pick of that date, keeping the others", () => {
    const picks = { removedAuto: [], manual: ["2026-11-02", "2026-11-09", "2026-11-02"] };

    expect(removeManualDeadline(picks, "2026-11-02").manual).toEqual(["2026-11-02", "2026-11-09"]);
  });
});
