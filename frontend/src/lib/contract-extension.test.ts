import {
  canExtendContract,
  earlyEndWarning,
  extensionDefaults,
  validateContractExtension,
  type ContractTermsInput,
  type PreviousPeriod,
} from "./contract-extension";

// 19 Nov 2026, read on the admin's own calendar as validateCreatorForm reads it.
const TODAY = new Date(2026, 10, 19);
const TODAY_DAY = "2026-11-19";

function period(status: PreviousPeriod["status"], overrides: Partial<PreviousPeriod> = {}): PreviousPeriod {
  return {
    status,
    type: "probation",
    endDate: "2026-12-31",
    daysBetween: 10,
    fixedRate: 2_500_000,
    earlyEndReason: null,
    ...overrides,
  };
}

const VALID: ContractTermsInput = {
  contractStart: "2027-01-01",
  contractEnd: "2027-03-31",
  interval: 14,
  quota: 6,
  fixedRate: 3_000_000,
  contractType: "regular",
};

describe("canExtendContract", () => {
  // Newest first, as the Creator Detail view carries the periods.
  it("offers a new period while the current contract runs (AC 1)", () => {
    expect(canExtendContract([period("active")])).toBe(true);
  });

  it("offers it any time after the contract ended, an early end included (AC 1)", () => {
    expect(canExtendContract([period("expired", { earlyEndReason: "fraud" }), period("expired")])).toBe(true);
  });

  it("does not offer a second one while a next period is still to start", () => {
    expect(canExtendContract([period("upcoming"), period("active")])).toBe(false);
  });

  it("has nothing to extend for a creator without a contract", () => {
    expect(canExtendContract([])).toBe(false);
  });
});

describe("extensionDefaults", () => {
  it("starts the day after the current end and keeps the previous rate and interval (AC 2)", () => {
    expect(extensionDefaults(period("active"), TODAY_DAY)).toEqual({
      contractStart: "2027-01-01",
      contractEnd: "",
      interval: 10,
      quota: 0,
      fixedRate: 2_500_000,
      // A returning creator has passed probation, as the prototype opens the form.
      contractType: "regular",
    });
  });

  it("never proposes a start in the past for a contract that ended long ago", () => {
    expect(extensionDefaults(period("expired", { endDate: "2026-10-01" }), TODAY_DAY).contractStart).toBe(
      TODAY_DAY,
    );
  });

  it("starts today when the contract ended yesterday: both rules meet on the same day", () => {
    expect(extensionDefaults(period("expired", { endDate: "2026-11-18" }), TODAY_DAY).contractStart).toBe(
      TODAY_DAY,
    );
  });

  it("crosses a year end without losing the day", () => {
    expect(extensionDefaults(period("active", { endDate: "2027-12-31" }), TODAY_DAY).contractStart).toBe(
      "2028-01-01",
    );
  });
});

describe("validateContractExtension", () => {
  const PREVIOUS_END = "2026-12-31";

  it("accepts a period that starts after the previous one", () => {
    expect(validateContractExtension(VALID, PREVIOUS_END, TODAY)).toEqual({});
  });

  it("accepts a start exactly one day after the previous end", () => {
    expect(validateContractExtension({ ...VALID, contractStart: "2027-01-01" }, PREVIOUS_END, TODAY)).toEqual({});
  });

  it.each([
    ["on the previous end", "2026-12-31"],
    ["inside the previous period", "2026-12-01"],
  ])("refuses a start %s: two periods never overlap (AC 2)", (_label, contractStart) => {
    expect(validateContractExtension({ ...VALID, contractStart }, PREVIOUS_END, TODAY).contractStart).toBe(
      "Tanggal mulai harus setelah akhir kontrak sebelumnya (31 Des 2026)",
    );
  });

  it("says a past start is in the past, not that it overlaps", () => {
    expect(
      validateContractExtension({ ...VALID, contractStart: "2026-11-18" }, "2026-10-01", TODAY).contractStart,
    ).toBe("Tanggal mulai tidak boleh sebelum hari ini");
  });

  // The same rules as Tambah Creator (AC 2), so the two forms never disagree on a contract.
  it.each([
    ["no contract type", { contractType: "" as const }, "contractType", "Jenis kontrak wajib dipilih"],
    ["no fixed rate", { fixedRate: null }, "fixedRate", "Fixed rate wajib diisi"],
    ["a rate one rupiah over the cap", { fixedRate: 10_000_001 }, "fixedRate", "Fixed rate maksimal Rp10.000.000"],
    ["a quota of zero", { quota: 0 }, "quota", "Jumlah konten harus lebih dari 0"],
    ["an interval of zero", { interval: 0 }, "interval", "Jarak antar-deadline minimal 1 hari"],
    ["an end before the start", { contractEnd: "2026-12-30" }, "contractStart", "Tanggal mulai tidak boleh setelah tanggal berakhir"],
  ])("refuses %s, as Tambah Creator does", (_label, change, field, message) => {
    expect(validateContractExtension({ ...VALID, ...change }, PREVIOUS_END, TODAY)).toEqual({ [field]: message });
  });

  it("accepts the highest rate the API takes", () => {
    expect(validateContractExtension({ ...VALID, fixedRate: 10_000_000 }, PREVIOUS_END, TODAY)).toEqual({});
  });

  it("refuses an end inside the buffer after the start, where no content could fit", () => {
    expect(
      validateContractExtension({ ...VALID, contractEnd: "2027-01-03" }, PREVIOUS_END, TODAY).contractEnd,
    ).toBe("Akhir kontrak paling cepat 6 Jan 2027 (masa buffer 5 hari)");
  });
});

describe("earlyEndWarning", () => {
  it.each([
    ["violation", "Kontrak sebelumnya diakhiri lebih awal karena Pelanggaran Kontrak."],
    ["fraud", "Kontrak sebelumnya diakhiri lebih awal karena Fraud."],
  ] as const)("warns when the previous contract was ended early for %s (AC 3)", (reason, warning) => {
    expect(earlyEndWarning(reason)).toBe(warning);
  });

  it.each([
    ["ended early for another reason", "other"],
    ["not ended early", null],
  ] as const)("stays quiet for a contract %s", (_label, reason) => {
    expect(earlyEndWarning(reason)).toBeNull();
  });
});
