import { rateChangeEvents, readRateChanges } from "./rate-change";

const RAW = {
  id: "change-1",
  oldRate: 4_000_000,
  newRate: 4_500_000,
  actorName: "rina@example.com",
  createdAt: "2026-11-25T03:00:00.000Z",
};

describe("readRateChanges", () => {
  it("reads each change the API lists", () => {
    expect(readRateChanges([RAW])).toEqual([RAW]);
  });

  it("reads the creator's copy, which names no admin", () => {
    const { actorName: _, ...mine } = RAW;
    expect(readRateChanges([mine])).toEqual([{ ...mine, actorName: null }]);
  });

  // An answer from before PBI-16 lists none; a broken entry costs its line, not the page.
  it.each([undefined, null, "x", [null, 7, {}, { ...RAW, oldRate: "4" }, { ...RAW, createdAt: "nanti" }, { ...RAW, id: 1 }, { ...RAW, newRate: null }]])(
    "reads nothing from %j",
    (raw) => {
      expect(readRateChanges(raw)).toEqual([]);
    },
  );
});

describe("rateChangeEvents", () => {
  it("words a change as the prototype does, naming the admin", () => {
    expect(rateChangeEvents(readRateChanges([RAW]))).toEqual([
      {
        kind: "event",
        id: "rate-change-1",
        text: "Fixed rate diubah Rp4.000.000 → Rp4.500.000 · rina@example.com",
        at: "2026-11-25T03:00:00.000Z",
      },
    ]);
  });

  it("says Admin where no admin is named", () => {
    expect(rateChangeEvents([{ ...RAW, actorName: null }])[0].text).toBe(
      "Fixed rate diubah Rp4.000.000 → Rp4.500.000 · Admin",
    );
  });

  it("adds nothing to an invoice without changes", () => {
    expect(rateChangeEvents(undefined)).toEqual([]);
  });
});
