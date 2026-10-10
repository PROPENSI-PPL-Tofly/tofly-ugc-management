import {
  EMPTY,
  daysUntil,
  formatContractWindow,
  formatDate,
  formatDaysLeft,
  formatDaysRemaining,
  formatDue,
  formatPercent,
  formatRevisions,
  formatTimestamp,
  jakartaDay,
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

  it.each(["segera", "2026-13-45", ""])(
    "shows a dash for %j, which is not a calendar day, instead of throwing",
    (date) => {
      expect(formatDate(date)).toBe(EMPTY);
    },
  );
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

  it("writes a plain calendar day as that day, with no time it never had", () => {
    // A day read as an instant is midnight UTC, which would show as 07.00 WIB.
    expect(formatTimestamp("2026-09-15")).toBe("15 Sep 2026");
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

describe("formatDue", () => {
  // Midday in Jakarta on 9 Oct 2026, well away from either midnight.
  const NOON = new Date("2026-10-09T05:00:00Z");

  it("counts the days left as H-n", () => {
    expect(formatDue("2026-10-12", NOON)).toBe("H-3");
  });

  it("reads H-1 on the eve of the deadline", () => {
    expect(formatDue("2026-10-10", NOON)).toBe("H-1");
  });

  it("says today on the deadline itself", () => {
    expect(formatDue("2026-10-09", NOON)).toBe("Hari ini");
  });

  it("counts the days a passed deadline is late", () => {
    expect(formatDue("2026-10-08", NOON)).toBe("Lewat 1 hari");
    expect(formatDue("2026-09-29", NOON)).toBe("Lewat 10 hari");
  });

  it("counts across the end of a month and of a year", () => {
    expect(formatDue("2026-11-01", NOON)).toBe("H-23");
    expect(formatDue("2027-01-01", NOON)).toBe("H-84");
  });

  it("takes today from Jakarta, not from UTC", () => {
    // 17.00 UTC on the 9th is already 00.00 on the 10th in WIB.
    const lastMinute = new Date("2026-10-09T16:59:59Z");
    const midnight = new Date("2026-10-09T17:00:00Z");

    expect(formatDue("2026-10-10", lastMinute)).toBe("H-1");
    expect(formatDue("2026-10-10", midnight)).toBe("Hari ini");
  });

  it("uses the current moment when none is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);

    try {
      expect(formatDue("2026-10-11")).toBe("H-2");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["a missing", null],
    ["an empty", ""],
    ["a malformed", "12 Oktober"],
  ])("shows a dash for %s deadline", (_label, deadline) => {
    expect(formatDue(deadline, NOON)).toBe(EMPTY);
  });
});

describe("daysUntil", () => {
  const NOON = new Date("2026-10-09T05:00:00Z");

  it("is positive before the deadline, zero on it and negative after", () => {
    expect(daysUntil("2026-10-12", NOON)).toBe(3);
    expect(daysUntil("2026-10-09", NOON)).toBe(0);
    expect(daysUntil("2026-10-07", NOON)).toBe(-2);
  });

  it("turns over at midnight in Jakarta", () => {
    expect(daysUntil("2026-10-10", new Date("2026-10-09T16:59:59Z"))).toBe(1);
    expect(daysUntil("2026-10-10", new Date("2026-10-09T17:00:00Z"))).toBe(0);
  });

  it.each([
    ["a missing", null],
    ["an empty", ""],
    ["a malformed", "12 Oktober"],
  ])("has no answer for %s deadline", (_label, deadline) => {
    expect(daysUntil(deadline, NOON)).toBeNull();
  });

  it("uses the current moment when none is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);

    try {
      expect(daysUntil("2026-10-10")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatDaysLeft", () => {
  it.each([
    [3, "H-3"],
    [1, "H-1"],
    [0, "Hari ini"],
    [-1, "Lewat 1 hari"],
    [-10, "Lewat 10 hari"],
  ])("reads %i days as %s", (days, label) => {
    expect(formatDaysLeft(days)).toBe(label);
  });

  it("shows a dash when the number of days is unknown", () => {
    expect(formatDaysLeft(null)).toBe(EMPTY);
  });

  it("agrees with formatDue, which is the same count taken from a deadline", () => {
    const now = new Date("2026-10-09T05:00:00Z");

    for (const deadline of ["2026-10-12", "2026-10-09", "2026-10-01", null, "segera"]) {
      expect(formatDaysLeft(daysUntil(deadline, now))).toBe(formatDue(deadline, now));
    }
  });
});

describe("jakartaDay", () => {
  it("writes the day the way the API writes calendar days", () => {
    expect(jakartaDay(new Date("2026-10-10T05:00:00Z"))).toBe("2026-10-10");
  });

  it("is already tomorrow in Jakarta from 17.00 UTC", () => {
    expect(jakartaDay(new Date("2026-10-10T16:59:59Z"))).toBe("2026-10-10");
    expect(jakartaDay(new Date("2026-10-10T17:00:00Z"))).toBe("2026-10-11");
  });

  it("crosses into the new month and the new year when Jakarta has", () => {
    expect(jakartaDay(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01");
    expect(jakartaDay(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });

  it("pads a single-digit month and day", () => {
    expect(jakartaDay(new Date("2027-03-04T05:00:00Z"))).toBe("2027-03-04");
  });

  it("uses the current moment when none is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T05:00:00Z"));

    try {
      expect(jakartaDay()).toBe("2026-10-10");
    } finally {
      vi.useRealTimers();
    }
  });

  it("agrees with daysUntil about which day today is", () => {
    const now = new Date("2026-10-10T17:30:00Z");

    expect(daysUntil(jakartaDay(now), now)).toBe(0);
  });
});
