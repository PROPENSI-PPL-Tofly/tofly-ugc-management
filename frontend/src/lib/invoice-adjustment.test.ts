import {
  adjustmentAmount,
  adjustmentLabel,
  adjustmentReason,
  AMOUNT_EMPTY,
  AMOUNT_INVALID,
  AMOUNT_THOUSANDS,
  AMOUNT_TOO_LARGE,
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
  });

  it.each(["", "   "])("says an amount left blank is required (%j)", (amount) => {
    expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_EMPTY });
    expect(AMOUNT_EMPTY).toBe("Jumlah wajib diisi");
  });

  it.each(["abc", "0", "-0", "1e5", "Rp100", "12,", "--5", "1.2345", "1.5", "2.50", "-0.01", "007"])(
    "refuses the amount %j in the backend's own words",
    (amount) => {
      expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_INVALID });
    },
  );

  // Rupiah is written with a dot between thousands; the API reads a dot as decimals, so an amount
  // typed that way is refused with what to do instead, never as "two decimals at most".
  it.each(["200.000", "-1.500.000", "1.234", "12.345.678"])(
    "asks for %j without the thousands dots",
    (amount) => {
      expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_THOUSANDS });
      expect(AMOUNT_THOUSANDS).toBe("Tulis nominal tanpa titik pemisah ribuan, mis. 200000");
    },
  );

  it("uses the backend's wording for a wrong amount, so the form and the server agree", () => {
    expect(AMOUNT_INVALID).toBe("Jumlah harus angka bulat dan bukan nol");
    expect(AMOUNT_TOO_LARGE).toBe("Jumlah maksimal Rp10.000.000 per penyesuaian");
  });

  it.each(["10000000", "-10000000", "1", "-1"])("takes %j, inside the Rp10.000.000 limit", (amount) => {
    expect(validateAdjustment(draft({ amount }))).toEqual({});
  });

  // Checked on the digits, never on Number(): past 2^53 the number is already rounded.
  it.each(["10000001", "-10000001", "99999999999999999", "9007199254740993", "1" + "0".repeat(40)])(
    "refuses %j as over the limit",
    (amount) => {
      expect(validateAdjustment(draft({ amount }))).toEqual({ amount: AMOUNT_TOO_LARGE });
    },
  );

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
    expect(adjustmentAmount(draft({ amount: "-100000" }))).toBe(-100000);
  });

  it("answers nothing rather than a zero for a blank or a wrong amount", () => {
    expect(adjustmentAmount(draft({ amount: "" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "abc" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "0" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "1.5" }))).toBeNull();
    expect(adjustmentAmount(draft({ amount: "99999999999999999" }))).toBeNull();
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
    expect(adjustmentLabel(-100000)).toBe("− Rp100.000");
  });
});

describe("refusalMessage", () => {
  it.each([
    ["INVOICE_FINALIZED", "Invoice sudah difinalisasi"],
    ["CONTRACT_NOT_ENDED", "Kontrak belum berakhir"],
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada komponen yang menunggu formula rate."],
    [
      "INVOICE_BONUS_PENDING",
      "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
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

  // OWASP Top 10:2025 A05 (Injection): a code from the server never reads an inherited property.
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "has nothing to say about %s, which is not a refusal",
    (code) => {
      expect(refusalMessage(code)).toBeNull();
    },
  );

  it("reads no message twice: the not-found codes share one", () => {
    expect(refusalMessage("CONTRACT_NOT_FOUND")).toBe(refusalMessage("INVOICE_NOT_FOUND"));
  });
});
