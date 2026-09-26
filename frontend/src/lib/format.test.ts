import {
  EMPTY,
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
  formatTimestamp,
} from "./format";

describe("formatDate", () => {
  it("writes a calendar day the Indonesian way", () => {
    expect(formatDate("2026-09-18")).toBe("18 Sep 2026");
    expect(formatDate("2026-12-07")).toBe("7 Des 2026");
  });

  it("keeps the day as written whatever the local timezone", () => {
    // A naive Date("2026-01-01") shifts to 31 Dec for anyone west of Greenwich.
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("shows a dash for a missing date", () => {
    expect(formatDate(null)).toBe(EMPTY);
  });
});

describe("formatTimestamp", () => {
  it("writes a moment as its day and time in Jakarta", () => {
    expect(formatTimestamp("2026-09-20T03:00:00.000Z")).toBe("20 Sep 2026, 10.00 WIB");
  });

  it("moves an evening in UTC onto the next day in Jakarta", () => {
    // 18.30 UTC is already 01.30 the next morning in WIB; formatting in UTC would show
    // the draft a day earlier than the creator sent it.
    expect(formatTimestamp("2026-09-19T18:30:00Z")).toBe("20 Sep 2026, 01.30 WIB");
  });

  it("crosses into the new year when Jakarta has", () => {
    expect(formatTimestamp("2025-12-31T17:00:00Z")).toBe("1 Jan 2026, 00.00 WIB");
  });

  it("reads a timestamp that carries its own offset", () => {
    expect(formatTimestamp("2026-09-20T10:05:00+07:00")).toBe("20 Sep 2026, 10.05 WIB");
  });

  it.each([null, "", "not-a-date"])("shows a dash for %j", (value) => {
    expect(formatTimestamp(value)).toBe(EMPTY);
  });
});

describe("formatContractWindow", () => {
  it("drops the repeated year when both ends share it", () => {
    expect(formatContractWindow("2026-06-10", "2026-12-07")).toBe("10 Jun – 7 Des 2026");
  });

  it("writes both years when they differ", () => {
    expect(formatContractWindow("2025-11-01", "2026-04-30")).toBe("1 Nov 2025 – 30 Apr 2026");
  });

  it("says so when there is no contract", () => {
    expect(formatContractWindow(null, null)).toBe("Belum ada kontrak");
    expect(formatContractWindow("2026-01-01", null)).toBe("Belum ada kontrak");
  });
});

describe("formatDaysRemaining", () => {
  it("counts down the days left", () => {
    expect(formatDaysRemaining(12)).toBe("sisa 12 hari");
    expect(formatDaysRemaining(1)).toBe("sisa 1 hari");
  });

  it("marks the final day", () => {
    expect(formatDaysRemaining(0)).toBe("berakhir hari ini");
  });

  it("counts up the days since it ended", () => {
    expect(formatDaysRemaining(-3)).toBe("berakhir 3 hari lalu");
  });

  it("shows a dash without a contract", () => {
    expect(formatDaysRemaining(null)).toBe(EMPTY);
  });
});

describe("formatPercent", () => {
  it("adds the sign", () => {
    expect(formatPercent(80)).toBe("80%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("shows a dash when nothing has been resolved yet", () => {
    expect(formatPercent(null)).toBe(EMPTY);
  });
});

describe("formatRevisions", () => {
  it("uses a decimal comma and a multiplier sign", () => {
    expect(formatRevisions(0)).toBe("0x");
    expect(formatRevisions(0.5)).toBe("0,5x");
    expect(formatRevisions(2.17)).toBe("2,17x");
  });
});
