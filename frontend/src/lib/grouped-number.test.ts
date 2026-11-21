import { groupDigits, digitsBefore, caretAfterDigits } from "./grouped-number";

// A number field groups its digits by thousands as they are typed, the way the app writes
// amounts (Rp1.500.000, 12.400 views): a dot every three digits from the right.
describe("groupDigits", () => {
  it.each([
    ["", ""],
    ["5", "5"],
    ["999", "999"],
    ["1000", "1.000"],
    ["1500000", "1.500.000"],
    ["12345678901", "12.345.678.901"],
  ])("writes %j as %j", (typed, shown) => {
    expect(groupDigits(typed)).toBe(shown);
  });

  // Typing into a grouped number leaves its dots in odd places; they are read again.
  it.each([
    ["1.0000", "10.000"],
    ["10.00", "1.000"],
    ["1.500.000", "1.500.000"],
    [".", ""],
  ])("groups %j again as %j", (typed, shown) => {
    expect(groupDigits(typed)).toBe(shown);
  });

  // Anything but digits and dots is left exactly as typed, so the field can say what is wrong
  // with it instead of quietly turning it into another number.
  it.each(["-1000", "1,5", "Rp 7a5", "2.500x", "1 000"])("leaves %j as typed", (typed) => {
    expect(groupDigits(typed)).toBe(typed);
  });
});

describe("the caret around regrouped digits", () => {
  it("counts the digits before the caret, dots aside", () => {
    expect(digitsBefore("1.000", 3)).toBe(2);
    expect(digitsBefore("12.345", 6)).toBe(5);
  });

  it("puts the caret after the same number of digits in the regrouped text", () => {
    expect(caretAfterDigits("10.000", 2)).toBe(2);
    expect(caretAfterDigits("1.000", 4)).toBe(5);
    expect(caretAfterDigits("1.000", 0)).toBe(0);
  });
});
