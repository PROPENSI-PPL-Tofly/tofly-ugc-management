import {
  formatChangeAmount,
  formatCountShort,
  formatKpiPercent,
  formatRupiahRounded,
  formatRupiahShort,
} from "./executive-kpi-format";

describe("formatRupiahShort", () => {
  it.each([
    [0, "Rp0"],
    [999_400, "Rp999.400"],
    [1_000_000, "Rp1 jt"],
    [41_240_000, "Rp41,2 jt"],
    [999_940_000, "Rp999,9 jt"],
    [1_000_000_000, "Rp1 M"],
    [2_460_000_000, "Rp2,5 M"],
  ])("writes %d as %s, as the design's Total Spending does", (amount, text) => {
    expect(formatRupiahShort(amount)).toBe(text);
  });

  it("writes an amount that rounds up to a thousand million in the next unit, never Rp1.000 jt", () => {
    expect(formatRupiahShort(999_960_000)).toBe("Rp1 M");
  });
});

describe("formatCountShort", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1 rb"],
    [12_449, "12 rb"],
    [999_400, "999 rb"],
    [1_284_500, "1,3 jt"],
    [24_000_000, "24 jt"],
  ])("writes %d views as %s", (count, text) => {
    expect(formatCountShort(count)).toBe(text);
  });

  it("writes a count that rounds up to a thousand thousand in the next unit, never 1.000 rb", () => {
    expect(formatCountShort(999_600)).toBe("1 jt");
  });
});

describe("formatRupiahRounded", () => {
  it.each([
    [32_113.6, "Rp32.114"],
    [32_113.4, "Rp32.113"],
    [0, "Rp0"],
  ])("writes %d as whole Rupiah, %s", (amount, text) => {
    expect(formatRupiahRounded(amount)).toBe(text);
  });
});

describe("formatKpiPercent", () => {
  it.each([
    [1, 86.4, "86,4%"],
    [1, 100, "100,0%"],
    [1, 0, "0,0%"],
    [2, 5.12, "5,12%"],
    [2, 5.1, "5,10%"],
  ])("writes a rate with %d decimals: %d as %s", (digits, value, text) => {
    expect(formatKpiPercent(digits)(value)).toBe(text);
  });
});

describe("formatChangeAmount", () => {
  it.each([
    [12.39, "12,4"],
    [-1.7, "1,7"],
    [0, "0"],
    [1250, "1.250"],
  ])(
    "writes the size of a change %d as %s, without its sign",
    (change, text) => {
      expect(formatChangeAmount(change)).toBe(text);
    },
  );
});
