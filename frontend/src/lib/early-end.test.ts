import type { CreatorPeriod } from "./creator-detail";
import {
  ACCESS_LABELS,
  EMPTY_EARLY_END_FORM,
  NOTE_MAX,
  earlyEndRequest,
  endablePeriod,
  isEarlyEndDirty,
  lastDayWindow,
  reasonWarning,
  upcomingPeriodsOf,
  validateEarlyEnd,
  type EarlyEndForm,
} from "./early-end";

const TODAY = "2026-11-24";

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: "22222222-2222-4222-8222-222222222222",
    periodNumber: 1,
    type: "regular",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    status: "active",
    contentQuota: 6,
    evergreenCount: 6,
    remainingEvergreenQuota: 0,
    daysBetween: 14,
    fixedRate: 2_500_000,
    earlyEndReason: null,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
    ...overrides,
  };
}

const VALID: EarlyEndForm = {
  invoice: "pay",
  lastDay: "2026-11-30",
  reason: "violation",
  note: "Konten diunggah ulang dari creator lain.",
  upcomingPeriods: "",
};

describe("endablePeriod (AC 1: only while the contract is active)", () => {
  it("is the running period", () => {
    const running = period();
    expect(endablePeriod([running])).toBe(running);
  });

  it("finds the running period behind a renewal waiting to start", () => {
    const running = period();
    expect(endablePeriod([period({ periodNumber: 2, status: "upcoming" }), running])).toBe(running);
  });

  it.each([
    ["before it starts", [period({ status: "upcoming" })]],
    ["after it ends", [period({ status: "expired" })]],
    ["once it was ended early", [period({ earlyEndReason: "fraud" })]],
    ["without any period", []],
  ])("is none %s", (_label, periods) => {
    expect(endablePeriod(periods)).toBeNull();
  });
});

describe("upcomingPeriodsOf", () => {
  it("lists the periods that have not started, oldest first", () => {
    const third = period({ periodNumber: 3, status: "upcoming", startDate: "2027-04-01" });
    const second = period({ periodNumber: 2, status: "upcoming", startDate: "2026-12-16" });
    expect(upcomingPeriodsOf([third, second, period()])).toEqual([second, third]);
  });
});

describe("lastDayWindow (AC 2)", () => {
  it("runs from today to the day before the original end", () => {
    expect(lastDayWindow(period(), TODAY)).toEqual({ min: "2026-11-24", max: "2026-12-14" });
  });

  it("never opens before the start date", () => {
    expect(lastDayWindow(period({ startDate: "2026-11-26" }), TODAY)).toEqual({
      min: "2026-11-26",
      max: "2026-12-14",
    });
  });

  it("is none on the original end day: only a cancel is left", () => {
    expect(lastDayWindow(period({ endDate: TODAY }), TODAY)).toBeNull();
  });
});

describe("validateEarlyEnd (the same rules and words as the API)", () => {
  it("accepts a complete form", () => {
    expect(validateEarlyEnd(VALID, period(), TODAY, 0)).toEqual({});
  });

  it("accepts the first and the last day of the window", () => {
    expect(validateEarlyEnd({ ...VALID, lastDay: TODAY }, period(), TODAY, 0)).toEqual({});
    expect(validateEarlyEnd({ ...VALID, lastDay: "2026-12-14" }, period(), TODAY, 0)).toEqual({});
  });

  it("asks for the last day, then for one inside the window", () => {
    expect(validateEarlyEnd({ ...VALID, lastDay: "" }, period(), TODAY, 0)).toEqual({
      lastDay: "Hari terakhir wajib diisi",
    });
    for (const lastDay of ["2026-11-23", "2026-12-15"]) {
      expect(validateEarlyEnd({ ...VALID, lastDay }, period(), TODAY, 0)).toEqual({
        lastDay: "Pilih antara 24 Nov 2026 dan 14 Des 2026",
      });
    }
  });

  it("tells the admin to cancel when no day before the end remains", () => {
    expect(validateEarlyEnd({ ...VALID, lastDay: TODAY }, period({ endDate: TODAY }), TODAY, 0)).toEqual({
      lastDay: "Tidak ada hari terakhir sebelum kontrak berakhir. Pilih Batalkan Invoice.",
    });
  });

  it("asks for no day when the invoice is cancelled: it is today", () => {
    expect(validateEarlyEnd({ ...VALID, invoice: "cancel", lastDay: "" }, period({ endDate: TODAY }), TODAY, 0)).toEqual(
      {},
    );
  });

  it("asks for the reason and the note", () => {
    expect(validateEarlyEnd({ ...VALID, reason: "", note: "   " }, period(), TODAY, 0)).toEqual({
      reason: "Pilih alasan",
      note: "Catatan wajib diisi",
    });
  });

  it("takes a note of exactly 500 characters, trimmed, and refuses 501", () => {
    expect(validateEarlyEnd({ ...VALID, note: ` ${"a".repeat(NOTE_MAX)} ` }, period(), TODAY, 0)).toEqual({});
    expect(validateEarlyEnd({ ...VALID, note: "a".repeat(NOTE_MAX + 1) }, period(), TODAY, 0)).toEqual({
      note: "Catatan maksimal 500 karakter",
    });
  });

  // AC 3: with a period that has not started, keep or delete must be chosen; neither is preset.
  it("asks to keep or delete the periods that have not started, only when there are some", () => {
    expect(validateEarlyEnd(VALID, period(), TODAY, 1)).toEqual({
      upcomingPeriods: "Pilih Pertahankan atau Hapus",
    });
    expect(validateEarlyEnd({ ...VALID, upcomingPeriods: "keep" }, period(), TODAY, 1)).toEqual({});
  });
});

describe("earlyEndRequest", () => {
  it("sends the day, the reason and the trimmed note", () => {
    expect(earlyEndRequest({ ...VALID, note: "  Fraud views.  " }, TODAY, 0)).toEqual({
      invoice: "pay",
      lastDay: "2026-11-30",
      reason: "violation",
      note: "Fraud views.",
    });
  });

  it("sends today when the invoice is cancelled, whatever day the field held", () => {
    expect(earlyEndRequest({ ...VALID, invoice: "cancel", lastDay: "2026-12-01" }, TODAY, 0).lastDay).toBe(TODAY);
  });

  it("sends the keep or delete choice only when a period has not started", () => {
    expect(earlyEndRequest({ ...VALID, upcomingPeriods: "delete" }, TODAY, 2)).toMatchObject({
      upcomingPeriods: "delete",
    });
    expect(earlyEndRequest({ ...VALID, upcomingPeriods: "delete" }, TODAY, 0)).not.toHaveProperty(
      "upcomingPeriods",
    );
  });
});

describe("reasonWarning (AC 4: only when the reason and the invoice pull apart)", () => {
  it.each([
    ["violation", "pay", "Alasan Pelanggaran Kontrak, tapi invoice tetap dibayar."],
    ["fraud", "pay", "Alasan Fraud, tapi invoice tetap dibayar."],
    ["other", "cancel", "Alasan Lainnya, tapi creator tidak dibayar."],
  ] as const)("%s with %s warns", (reason, invoice, warning) => {
    expect(reasonWarning({ reason, invoice })).toBe(warning);
  });

  it.each([
    ["violation", "cancel"],
    ["fraud", "cancel"],
    ["other", "pay"],
    ["", "pay"],
  ] as const)("%s with %s says nothing", (reason, invoice) => {
    expect(reasonWarning({ reason, invoice })).toBeNull();
  });
});

describe("ACCESS_LABELS", () => {
  it("words each way access closes, as the prototype does", () => {
    expect(ACCESS_LABELS).toEqual({
      closed_now: "Langsung ditutup",
      after_previous_invoice_paid: "Ditutup setelah invoice periode lama Paid",
      after_invoice_paid: "Ditutup sehari setelah invoice Paid",
      open_for_upcoming: "Tetap terbuka untuk periode yang dipertahankan",
    });
  });
});

describe("isEarlyEndDirty (asks before throwing the form away)", () => {
  it("is clean as it opens", () => {
    expect(isEarlyEndDirty(EMPTY_EARLY_END_FORM)).toBe(false);
  });

  it.each([
    ["a last day", { lastDay: "2026-11-30" }],
    ["a reason", { reason: "fraud" }],
    ["a note", { note: "x" }],
    ["the cancel choice", { invoice: "cancel" }],
    ["a keep or delete choice", { upcomingPeriods: "keep" }],
  ] as const)("is dirty with %s", (_label, change) => {
    expect(isEarlyEndDirty({ ...EMPTY_EARLY_END_FORM, ...change })).toBe(true);
  });

  it("ignores a note of spaces only", () => {
    expect(isEarlyEndDirty({ ...EMPTY_EARLY_END_FORM, note: "   " })).toBe(false);
  });
});
