import { EARLY_END_LABEL, earlyEndReasonLabel, earlyEndSentence, readEarlyEnd } from "./early-end-display";

// PBI-37, 37.3: what the admin views show of a contract ended early, read from the API's own
// earlyEnd object (37.1) and never guessed from the dates.
describe("readEarlyEnd", () => {
  it("reads the original end and the reason the API sends", () => {
    expect(readEarlyEnd({ originalEndDate: "2026-12-31", reason: "fraud" })).toEqual({
      originalEndDate: "2026-12-31",
      reason: "fraud",
    });
  });

  // OWASP A06: the API says null for a contract that runs as agreed, and an API from before
  // PBI-37 says nothing. Neither is an early end, however its dates look.
  it.each([
    ["null, a contract that runs as agreed", null],
    ["nothing, an API from before PBI-37", undefined],
  ])("reads %s as no early end", (_, raw) => {
    expect(readEarlyEnd(raw)).toBeNull();
  });

  // OWASP A10: a broken answer shows no early end rather than a crash or an "Invalid Date".
  it.each([
    ["text", "violation"],
    ["a list", [{ originalEndDate: "2026-12-31", reason: "fraud" }]],
    ["no original end", { reason: "fraud" }],
    ["an original end that is not text", { originalEndDate: 20261231, reason: "fraud" }],
    ["an original end that is not a calendar day", { originalEndDate: "31/12/2026", reason: "fraud" }],
    ["an instant instead of a calendar day", { originalEndDate: "2026-12-31T00:00:00.000Z", reason: "fraud" }],
  ])("reads an early end with %s as none", (_, raw) => {
    expect(readEarlyEnd(raw)).toBeNull();
  });

  // Still ended early: the dates hold, only the reason is one this app cannot name.
  it.each([
    ["a reason this app does not know", "refund"],
    ["no reason", undefined],
    ["markup for a reason", "<img src=x onerror=alert(1)>"],
  ])("keeps the early end but names no reason for %s", (_, reason) => {
    expect(readEarlyEnd({ originalEndDate: "2026-12-31", reason })).toEqual({
      originalEndDate: "2026-12-31",
      reason: null,
    });
  });

  // The note is for admins on Creator Detail and stays out of the display model entirely.
  it("keeps nothing but the original end and the reason", () => {
    expect(
      Object.keys(
        readEarlyEnd({ originalEndDate: "2026-12-31", reason: "other", note: "catatan", endedAt: "2026-11-20T03:00:00Z" })!,
      ),
    ).toEqual(["originalEndDate", "reason"]);
  });
});

describe("earlyEndSentence", () => {
  it("says the new last day and the original end in PBI-37's words (AC 16)", () => {
    expect(earlyEndSentence("2026-11-20", { originalEndDate: "2026-12-31", reason: "fraud" })).toBe(
      "Berakhir lebih awal pada 20 Nov 2026, semula 31 Des 2026.",
    );
  });

  // Calendar days are formatted as written: the first of a month never slides to the day before.
  it("never moves a day across midnight", () => {
    expect(earlyEndSentence("2026-11-01", { originalEndDate: "2027-01-01", reason: null })).toBe(
      "Berakhir lebih awal pada 1 Nov 2026, semula 1 Jan 2027.",
    );
  });

  it("dashes a last day the API did not send", () => {
    expect(earlyEndSentence(null, { originalEndDate: "2026-12-31", reason: null })).toBe(
      "Berakhir lebih awal pada —, semula 31 Des 2026.",
    );
  });
});

describe("earlyEndReasonLabel", () => {
  it.each([
    ["violation", "Pelanggaran Kontrak"],
    ["fraud", "Fraud"],
    ["other", "Lainnya"],
  ] as const)("names %s as the early-end form does", (reason, label) => {
    expect(earlyEndReasonLabel({ originalEndDate: "2026-12-31", reason })).toBe(label);
  });

  it("dashes a reason this app could not name", () => {
    expect(earlyEndReasonLabel({ originalEndDate: "2026-12-31", reason: null })).toBe("—");
  });
});

describe("EARLY_END_LABEL", () => {
  it("is PBI-37's label", () => {
    expect(EARLY_END_LABEL).toBe("Berakhir Lebih Awal");
  });
});
