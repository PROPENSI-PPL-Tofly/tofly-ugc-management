import {
  adjustmentAmount,
  adjustmentLabel,
  adjustmentReason,
  AMOUNT_EMPTY,
  AMOUNT_INVALID,
  canAdjust,
  canFinalize,
  FINAL_LABEL,
  REASON_EMPTY,
  REASON_MAX_LENGTH,
  REASON_TOO_LONG,
  refusalMessage,
  validateAdjustment,
  type AdjustmentDraft,
} from "./invoice-adjustment";

function draft(over: Partial<AdjustmentDraft> = {}): AdjustmentDraft {
  return { amount: "125000", reason: "Koreksi kelebihan tagihan", ...over };
}

describe("validateAdjustment", () => {
  it("takes an amount and a reason the backend would take", () => {
    expect(validateAdjustment(draft())).toEqual({});
  });

  it("takes an adjustment taken away as well as one added", () => {
    expect(validateAdjustment(draft({ amount: "-75000" }))).toEqual({});
    expect(validateAdjustment(draft({ amount: "-75000.25" }))).toEqual({});
  });

  it.each(["", "   "])("says an amount left blank is required (%j)", (amount) => {
    expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_EMPTY });
    expect(AMOUNT_EMPTY).toBe("Jumlah wajib diisi");
  });

  it.each(["abc", "1.234", "0", "-0", "1e5", "Rp100", "12,", "--5"])(
    "refuses the amount %j in the backend's own words",
    (amount) => {
      expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_INVALID });
    },
  );

  it("uses the backend's wording for a wrong amount, so the form and the server agree", () => {
    expect(AMOUNT_INVALID).toBe("Jumlah harus bukan nol dan maksimal dua angka desimal");
  });

  it.each(["", "   ", "\t\n"])("says a reason left blank is required (%j)", (reason) => {
    expect(validateAdjustment(draft({ reason }))).toEqual({ reason: REASON_EMPTY });
  });

  it("takes a reason of exactly the maximum length", () => {
    expect(validateAdjustment(draft({ reason: "x".repeat(REASON_MAX_LENGTH) }))).toEqual({});
  });

  it("refuses a reason one character over, counting characters and not UTF-16 units", () => {
    const emoji = "💰".repeat(REASON_MAX_LENGTH + 1);

    expect(validateAdjustment(draft({ reason: emoji }))).toEqual({ reason: REASON_TOO_LONG });
    expect(validateAdjustment(draft({ reason: "x".repeat(REASON_MAX_LENGTH + 1) }))).toEqual({
      reason: REASON_TOO_LONG,
    });
  });

  it("reports every field at once rather than one at a time", () => {
    expect(validateAdjustment({ amount: "0", reason: "" })).toEqual({
      amount: AMOUNT_INVALID,
      reason: REASON_EMPTY,
    });
  });

  it("keeps the reason's own words apart from what surrounds it", () => {
    expect(validateAdjustment(draft({ reason: "  Koreksi  " })).reason).toBeUndefined();
    expect(adjustmentReason(draft({ reason: "  Koreksi  " }))).toBe("Koreksi");
  });
});

describe("adjustmentAmount", () => {
  it("reads the amount as the API takes it", () => {
    expect(adjustmentAmount(draft({ amount: " 200000 " }))).toBe(200000);
    expect(adjustmentAmount(draft({ amount: "-100000.5" }))).toBe(-100000.5);
  });

  it("answers nothing rather than a zero for a blank or a wrong amount", () => {
    expect(adjustmentAmount(draft({ amount: "" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "abc" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "0" }))).toBeNull();
  });
});

describe("canAdjust", () => {
  it("lets an admin adjust an invoice that is still running", () => {
    expect(canAdjust("accruing")).toBe(true);
  });

  it.each(["finalized", "creator_acked", "payment_uploaded", "paid"] as const)(
    "refuses an adjustment once the invoice is %s",
    (status) => {
      expect(canAdjust(status)).toBe(false);
    },
  );
});

describe("canFinalize", () => {
  it("freezes once the contract has ended and the invoice is still running", () => {
    expect(canFinalize("accruing", "2026-10-18", "2026-10-17")).toBe(true);
  });

  it("includes a contract that ended early, on the day it ended", () => {
    expect(canFinalize("accruing", "2026-10-18", "2026-06-30")).toBe(true);
  });

  it("refuses on the last day of the contract, as the backend counts an ended contract", () => {
    expect(canFinalize("accruing", "2026-10-18", "2026-10-18")).toBe(false);
    expect(canFinalize("accruing", "2026-10-18", "2026-12-31")).toBe(false);
  });

  it.each(["finalized", "creator_acked", "payment_uploaded", "paid"] as const)(
    "refuses a second freeze once the invoice is %s",
    (status) => {
      expect(canFinalize(status, "2026-10-18", "2026-10-17")).toBe(false);
    },
  );
});

describe("the words on the controls", () => {
  it("marks a frozen invoice with the prototype's word", () => {
    expect(FINAL_LABEL).toBe("Final");
  });

  it("reads an adjustment as added or taken away", () => {
    expect(adjustmentLabel(200000)).toBe("+Rp200.000");
    expect(adjustmentLabel(-100000)).toBe("-Rp100.000");
  });
});

describe("refusalMessage", () => {
  it.each([
    ["INVOICE_FINALIZED", "Invoice sudah difinalisasi"],
    ["CONTRACT_NOT_ENDED", "Kontrak belum berakhir"],
    [
      "INVOICE_DATA_INCOMPLETE",
      "Invoice belum bisa difinalisasi: masih ada data yang menunggu, seperti bonus performa.",
    ],
    ["INVOICE_NOT_FOUND", "Invoice tidak ditemukan."],
    ["CONTRACT_NOT_FOUND", "Invoice tidak ditemukan."],
  ])("reads %s for the admin", (code, message) => {
    expect(refusalMessage(code)).toBe(message);
  });

  it("has nothing to say about a code it does not know, leaving the caller's message to stand", () => {
    expect(refusalMessage("SOMETHING_ELSE")).toBeNull();
    expect(refusalMessage(undefined)).toBeNull();
  });
});
