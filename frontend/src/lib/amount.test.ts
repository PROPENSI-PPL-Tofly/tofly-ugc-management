import { amountProblem, amountText, MAX_AMOUNT_DIGITS, parseAmount } from "./amount";

describe("parseAmount", () => {
  it("reads typed digits as a whole number", () => {
    expect(parseAmount("500000")).toBe(500000);
  });

  it("reads an empty field as null, not 0", () => {
    expect(parseAmount("")).toBeNull();
  });

  it("drops everything that is not a digit", () => {
    expect(parseAmount("Rp 1.500,00")).toBe(150000);
  });

  it("reads a field of letters as empty", () => {
    expect(parseAmount("abc")).toBeNull();
  });

  it("keeps 0 as a real value", () => {
    expect(parseAmount("0")).toBe(0);
  });

  it("stops at ten digits", () => {
    expect(parseAmount("12345678901234")).toBe(1234567890);
  });
});

describe("amountText", () => {
  it("shows a held number as digits", () => {
    expect(amountText(75000)).toBe("75000");
  });

  it("shows 0 as a digit, because 0 is a value", () => {
    expect(amountText(0)).toBe("0");
  });

  it("shows nothing for an empty field", () => {
    expect(amountText(null)).toBe("");
  });
});

describe("amountProblem", () => {
  it("asks for a value that is missing", () => {
    expect(amountProblem(null, "Fixed rate")).toBe("Fixed rate wajib diisi");
  });

  it("accepts 0, the lowest allowed value", () => {
    expect(amountProblem(0, "Fixed rate")).toBeUndefined();
  });

  it("accepts a ten-digit number, the highest allowed", () => {
    expect(amountProblem(9_999_999_999, "Fixed rate")).toBeUndefined();
  });

  it("rejects a negative number", () => {
    expect(amountProblem(-1, "Fixed rate")).toBe("Fixed rate minimal 0");
  });

  it("rejects an eleven-digit number", () => {
    expect(amountProblem(10_000_000_000, "Fixed rate")).toBe(
      `Fixed rate maksimal ${MAX_AMOUNT_DIGITS} digit`,
    );
  });

  it("rejects a fraction", () => {
    expect(amountProblem(1.5, "Fixed rate")).toBe("Fixed rate harus berupa angka bulat");
  });

  it("rejects a value that is not a number", () => {
    expect(amountProblem(Number.NaN, "Fixed rate")).toBe("Fixed rate harus berupa angka bulat");
  });
});
