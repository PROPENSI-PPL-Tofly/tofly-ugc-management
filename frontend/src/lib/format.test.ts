import {
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "./format";

describe("formatDate", () => {
  it("writes a calendar day the way the interface reads it", () => {
    expect(formatDate("2026-09-16")).toBe("16 Sep 2026");
  });

  it("leaves a missing date as a dash", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("reads the day as written rather than shifting it by timezone", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("formatContractWindow", () => {
  it("writes the year once when both ends share it", () => {
    expect(formatContractWindow("2026-06-08", "2026-12-25")).toBe("8 Jun – 25 Des 2026");
  });

  it("keeps both years when the contract crosses one", () => {
    expect(formatContractWindow("2026-07-01", "2027-01-31")).toBe("1 Jul 2026 – 31 Jan 2027");
  });

  it("says so when there is no contract", () => {
    expect(formatContractWindow(null, null)).toBe("Belum ada kontrak");
  });
});

describe("formatDaysRemaining", () => {
  it("counts down while the contract runs", () => {
    expect(formatDaysRemaining(30)).toBe("sisa 30 hari");
  });

  it("calls out the final day", () => {
    expect(formatDaysRemaining(0)).toBe("berakhir hari ini");
  });

  it("counts up once the contract has ended", () => {
    expect(formatDaysRemaining(-5)).toBe("berakhir 5 hari lalu");
  });

  it("has nothing to say without a contract", () => {
    expect(formatDaysRemaining(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("writes a rate as a percentage", () => {
    expect(formatPercent(75)).toBe("75%");
  });

  it("shows a dash when there is nothing to rate yet", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatRevisions", () => {
  it("writes the average with a comma, as Indonesian does", () => {
    expect(formatRevisions(0.5)).toBe("0,5x");
  });

  it("keeps a whole number readable", () => {
    expect(formatRevisions(2)).toBe("2x");
  });
});
