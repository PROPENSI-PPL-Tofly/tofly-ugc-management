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

  // PRD 3.4/3.6: deadline must be on/after max(contract start, today) + buffer, and
  // on/before the contract end date — same rule generateDeadlineSchedule already applies at
  // onboarding, reused here via getBufferWindow for a single content added later.
  describe("deadline", () => {
    it("is required", () => {
      const errors = validateEvergreenSlot({ ...VALID_INPUT, deadline: "" });

      expect(errors.deadline).toBe("Tanggal deadline wajib diisi");
    });

    it("rejects a deadline before the buffer window", () => {
      // One day before the buffer's first allowed day (2026-10-06).
      const errors = validateEvergreenSlot({ ...VALID_INPUT, deadline: "2026-10-05" });

      expect(errors.deadline).toBe("Deadline paling cepat 2026-10-06");
    });

    it("accepts the first day the buffer allows", () => {
      const errors = validateEvergreenSlot({ ...VALID_INPUT, deadline: "2026-10-06" });

      expect(errors.deadline).toBeUndefined();
    });

    it("measures the buffer from today when the contract already started", () => {
      // Contract started in the past (1 Agu); the buffer must count from today (24 Sep),
      // not that stale start date — the same rule generateDeadlineSchedule already applies.
      const errors = validateEvergreenSlot({
        ...VALID_INPUT,
        contractStart: "2026-08-01",
        deadline: "2026-09-28",
      });

      expect(errors.deadline).toBe("Deadline paling cepat 2026-09-29");
    });

    it("rejects a deadline after the contract ends", () => {
      const errors = validateEvergreenSlot({ ...VALID_INPUT, deadline: "2027-01-01" });

      expect(errors.deadline).toBe("Deadline tidak boleh setelah akhir kontrak");
    });

    it("accepts the contract end date itself", () => {
      const errors = validateEvergreenSlot({ ...VALID_INPUT, deadline: "2026-12-31" });

      expect(errors.deadline).toBeUndefined();
    });
  });

  it("reports the quota and deadline errors independently, not just the first one found", () => {
    const errors = validateEvergreenSlot({
      ...VALID_INPUT,
      evergreenScheduledCount: 6,
      deadline: "2027-01-01",
    });

    expect(errors).toEqual({
      contentType: "Slot Evergreen sudah penuh",
      deadline: "Deadline tidak boleh setelah akhir kontrak",
    });
  });
});
