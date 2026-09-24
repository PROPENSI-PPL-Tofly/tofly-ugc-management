import { validateEvergreenSlot, type EvergreenSlotInput } from "./content-schedule";

// Contract 1 Okt – 31 Des, today 24 Sep, 5-day buffer: same shape as the fixture in
// deadline-allocation.test.ts, so the two related rule sets stay easy to compare.
const VALID_INPUT: EvergreenSlotInput = {
  contentType: "evergreen",
  contractStart: "2026-10-01",
  contractEnd: "2026-12-31",
  today: "2026-09-24",
  bufferDays: 5,
  contentQuota: 6,
  evergreenScheduledCount: 3,
  deadline: "2026-10-10",
};

describe("validateEvergreenSlot", () => {
  it("accepts Evergreen when the quota still has room", () => {
    expect(validateEvergreenSlot(VALID_INPUT).contentType).toBeUndefined();
  });

  it("rejects Evergreen once the quota is already full", () => {
    const errors = validateEvergreenSlot({ ...VALID_INPUT, evergreenScheduledCount: 6 });

    expect(errors.contentType).toBe("Slot Evergreen sudah penuh");
  });

  // Specific content never counts against the Evergreen quota (PRD 3.4/3.7) — a full quota
  // must not block it.
  it("does not block Specific content when the Evergreen quota is full", () => {
    const errors = validateEvergreenSlot({
      ...VALID_INPUT,
      contentType: "specific",
      evergreenScheduledCount: 6,
    });

    expect(errors.contentType).toBeUndefined();
  });
});
