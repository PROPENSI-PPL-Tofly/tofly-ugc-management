import {
  contractDateLimits,
  contractTypePrefix,
  earliestContractEnd,
  localCalendarDay,
  MAX_CONTENT_QUOTA,
  scheduleDeadlines,
  scheduleReady,
  validateCreatorForm,
} from "./creator-form";

describe("validateCreatorForm", () => {
  const VALID_INPUT = {
    name: "Bagas",
    email: "bagas@example.com",
    contractStart: "2026-10-01",
    contractEnd: "2026-12-31",
    interval: 14,
    quota: 6,
    fixedRate: 500000,
    socialPlatform: "instagram" as const,
    socialUsername: "salsa.amelia",
    contractType: "regular" as const,
  };

  it("requires a contract type", () => {
    expect(validateCreatorForm({ ...VALID_INPUT, contractType: "" }).contractType).toBe(
      "Jenis kontrak wajib dipilih",
    );
    expect(validateCreatorForm(VALID_INPUT).contractType).toBeUndefined();
  });

  it("requires a name", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, name: "" });

    expect(errors.name).toBe("Nama wajib diisi");
  });

  it("rejects an invalid email format", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, email: "not-an-email" });

    expect(errors.email).toBe("Format email tidak valid");
  });

  // PR review: an unescaped `.` in EMAIL_FORMAT would match any single character, so a domain
  // with no literal dot at all (just a long-enough run of characters) could slip through as
  // "valid" — the regex engine backtracks to treat any one character as the stand-in dot.
  it("rejects a domain with no literal dot", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, email: "bagas@examplecom" });

    expect(errors.email).toBe("Format email tidak valid");
  });

  it("rejects a contract start after the contract end", () => {
    // Pinned well before both dates: this test isolates the range rule from the
    // "not before today" rule, so it stays deterministic regardless of the real clock.
    const today = new Date("2026-01-01T00:00:00Z");

    const errors = validateCreatorForm(
      { ...VALID_INPUT, contractStart: "2026-10-10", contractEnd: "2026-10-01" },
      today,
    );

    expect(errors.contractStart).toBe("Tanggal mulai tidak boleh setelah tanggal berakhir");
  });

  it("rejects a contract start before today", () => {
    const today = new Date("2026-10-05T00:00:00Z");

    const errors = validateCreatorForm({ ...VALID_INPUT, contractStart: "2026-10-01" }, today);

    expect(errors.contractStart).toBe("Tanggal mulai tidak boleh sebelum hari ini");
  });

  // Boundary at 0 mirrors the database's `days_between > 0` check constraint
  // (supabase/migrations/..._creator_database.sql).
  it("rejects an interval of zero days", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, interval: 0 });

    expect(errors.interval).toBe("Jarak antar-deadline minimal 1 hari");
  });

  // Stricter than the database's `content_quota >= 0` check constraint: the earlier "is 0
  // allowed?" question is now settled — a new creator with a 0-content commitment makes no
  // sense from a manual UI review, same reasoning as fixed rate below.
  it("rejects a quota of zero", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, quota: 0 });

    expect(errors.quota).toBe("Jumlah konten harus lebih dari 0");
  });

  it("rejects a negative quota", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, quota: -1 });

    expect(errors.quota).toBe("Jumlah konten harus lebih dari 0");
  });

  // Stricter than the database's `fixed_rate >= 0` check constraint: a new creator's rate
  // is a business amount, not a counter like quota, so exactly 0 makes no sense either.
  // (Manual UI review: a numeric field pre-filled with "0" made typing "1" produce "01".)
  it("rejects a fixed rate of zero", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, fixedRate: 0 });

    expect(errors.fixedRate).toBe("Fixed rate harus lebih dari 0");
  });

  it("rejects a negative fixed rate", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, fixedRate: -1 });

    expect(errors.fixedRate).toBe("Fixed rate harus lebih dari 0");
  });

  // A new creator needs at least one connected account before Tofly can pull performance
  // data — only the platform is enum-constrained by the database (instagram | tiktok); the
  // username itself is free text, same as the DB's `social_accounts.username` column.
  it("requires a social platform", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, socialPlatform: "" });

    expect(errors.socialPlatform).toBe("Platform wajib dipilih");
  });

  it("requires a social username", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, socialUsername: "" });

    expect(errors.socialUsername).toBe("Username wajib diisi");
  });

  // `existingEmails` is not a parameter of validateCreatorForm yet — GREEN adds it. This is
  // the frontend-only half of duplicate detection: checked against whatever creator list the
  // page already has loaded, not a backend lookup (that stays the database's unique
  // constraint on `users.email`, enforced when the create endpoint ships later).
  it("rejects an email that is already registered", () => {
    const today = new Date("2026-01-01T00:00:00Z");

    const errors = validateCreatorForm(VALID_INPUT, today, ["bagas@example.com"]);

    expect(errors.email).toBe("Email sudah terdaftar");
  });
});

describe("localCalendarDay", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // 01:30 WIB on the 24th is still the 23rd in UTC; the admin's "today" is the 24th.
  it("reads the calendar day in the admin's own timezone, not UTC", () => {
    process.env.TZ = "Asia/Jakarta";

    expect(localCalendarDay(new Date("2026-09-23T18:30:00Z"))).toBe("2026-09-24");
  });

  it("pads single-digit months and days", () => {
    process.env.TZ = "UTC";

    expect(localCalendarDay(new Date("2026-01-05T10:00:00Z"))).toBe("2026-01-05");
  });

  it("rejects yesterday as a contract start just after local midnight", () => {
    process.env.TZ = "Asia/Jakarta";

    const errors = validateCreatorForm(
      {
        name: "Bagas",
        email: "bagas@example.com",
        contractStart: "2026-09-23",
        contractEnd: "2026-12-31",
        interval: 14,
        quota: 1,
        fixedRate: 500000,
        socialPlatform: "instagram",
        socialUsername: "bagas",
        contractType: "regular",
      },
      new Date("2026-09-23T18:30:00Z"),
    );

    expect(errors.contractStart).toBe("Tanggal mulai tidak boleh sebelum hari ini");
  });
});

describe("contractDateLimits", () => {
  it("keeps the start between today and the chosen end", () => {
    expect(contractDateLimits({ contractStart: "", contractEnd: "2026-12-31" }, "2026-09-24")).toEqual({
      startMin: "2026-09-24",
      startMax: "2026-12-31",
      endMin: "2026-09-29",
    });
  });

  // The picker itself already refuses an end inside the buffer, not only the validation.
  it("keeps the end at least the buffer after the chosen start", () => {
    expect(contractDateLimits({ contractStart: "2026-10-01", contractEnd: "" }, "2026-09-24")).toEqual({
      startMin: "2026-09-24",
      startMax: undefined,
      endMin: "2026-10-06",
    });
  });
});

describe("earliestContractEnd", () => {
  it("is the buffer after the start when the start is still ahead", () => {
    expect(earliestContractEnd("2026-10-01", "2026-09-24")).toBe("2026-10-06");
  });

  it("counts from today when the start is today or already past", () => {
    expect(earliestContractEnd("2026-09-24", "2026-09-24")).toBe("2026-09-29");
    expect(earliestContractEnd("", "2026-09-24")).toBe("2026-09-29");
  });

  it("crosses a month end", () => {
    expect(earliestContractEnd("2026-10-29", "2026-09-24")).toBe("2026-11-03");
  });
});

describe("validateCreatorForm contract end and limits", () => {
  const TODAY = new Date("2026-09-24T05:00:00Z");
  const INPUT = {
    name: "Bagas",
    email: "bagas@example.com",
    contractStart: "2026-10-01",
    contractEnd: "2026-12-31",
    interval: 14,
    quota: 3,
    fixedRate: 500000,
    socialPlatform: "instagram" as const,
    socialUsername: "bagas",
    contractType: "regular" as const,
  };

  // UAT: a contract of 1–3 days is all buffer, so no deadline could ever fit in it.
  it("rejects a contract that ends inside the buffer, naming the earliest end", () => {
    const errors = validateCreatorForm({ ...INPUT, contractEnd: "2026-10-03" }, TODAY);

    expect(errors.contractEnd).toBe(
      "Akhir kontrak paling cepat 6 Okt 2026 (masa buffer 5 hari)",
    );
  });

  it("accepts a contract that ends exactly when the buffer does", () => {
    expect(validateCreatorForm({ ...INPUT, contractEnd: "2026-10-06" }, TODAY).contractEnd).toBeUndefined();
  });

  it("rejects the day before the buffer ends", () => {
    expect(validateCreatorForm({ ...INPUT, contractEnd: "2026-10-05" }, TODAY).contractEnd).toBeDefined();
  });

  it("asks for both dates by name instead of blaming the other one", () => {
    const errors = validateCreatorForm({ ...INPUT, contractStart: "", contractEnd: "" }, TODAY);

    expect(errors.contractStart).toBe("Tanggal mulai wajib diisi");
    expect(errors.contractEnd).toBe("Tanggal berakhir wajib diisi");
  });

  it("rejects an end before today", () => {
    const errors = validateCreatorForm(
      { ...INPUT, contractStart: "2026-09-24", contractEnd: "2026-09-20" },
      TODAY,
    );

    expect(errors.contractEnd).toBe("Tanggal berakhir tidak boleh sebelum hari ini");
  });

  it(`accepts up to ${MAX_CONTENT_QUOTA} contents and refuses one more`, () => {
    expect(MAX_CONTENT_QUOTA).toBe(100);
    expect(validateCreatorForm({ ...INPUT, quota: 100 }, TODAY).quota).toBeUndefined();
    expect(validateCreatorForm({ ...INPUT, quota: 101 }, TODAY).quota).toBe(
      "Jumlah konten maksimal 100",
    );
  });

  it("treats a name or username of only spaces as empty", () => {
    const errors = validateCreatorForm({ ...INPUT, name: "   ", socialUsername: "  " }, TODAY);

    expect(errors.name).toBe("Nama wajib diisi");
    expect(errors.socialUsername).toBe("Username wajib diisi");
  });

  it("holds names, usernames and emails to the API's lengths", () => {
    const long = "a".repeat(101);
    const errors = validateCreatorForm(
      {
        ...INPUT,
        name: long,
        socialUsername: long,
        email: `${"a".repeat(250)}@x.co`,
      },
      TODAY,
    );

    expect(errors.name).toBe("Nama maksimal 100 karakter");
    expect(errors.socialUsername).toBe("Username maksimal 100 karakter");
    expect(errors.email).toBe("Email maksimal 254 karakter");
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(validateCreatorForm({ ...INPUT, name: "a".repeat(100) }, TODAY).name).toBeUndefined();
  });

  // Same pattern as the API, so an address never passes here only to bounce off the server.
  it.each(["a!b@example.com", "a..b@example.com", ".a@example.com", "a@example..com"])(
    "rejects %s like the API does",
    (email) => {
      expect(validateCreatorForm({ ...INPUT, email }, TODAY).email).toBe("Format email tidak valid");
    },
  );

  it.each(["salsa.amelia+ugc@example.co.id", "a_b%c@sub-domain.example.com"])(
    "accepts %s",
    (email) => {
      expect(validateCreatorForm({ ...INPUT, email }, TODAY).email).toBeUndefined();
    },
  );
});

describe("scheduleReady", () => {
  it("is true once the dates, interval and quota have nothing wrong with them", () => {
    expect(scheduleReady({ name: "Nama wajib diisi" })).toBe(true);
  });

  it.each(["contractStart", "contractEnd", "interval", "quota"] as const)(
    "waits while %s has a problem",
    (field) => {
      expect(scheduleReady({ [field]: "salah" })).toBe(false);
    },
  );
});

describe("scheduleDeadlines", () => {
  const FORM = {
    contractStart: "2026-10-01",
    contractEnd: "2026-12-31",
    interval: 14,
    quota: 3,
  };

  it("places the deadlines five days after the later of start and today, one interval apart", () => {
    expect(scheduleDeadlines(FORM, "2026-09-24")).toEqual({
      autoDeadlines: ["2026-10-06", "2026-10-20", "2026-11-03"],
      allocatedCount: 3,
      remainingCount: 0,
      quota: 3,
    });
  });

  it.each([
    { contractStart: "" },
    { contractEnd: "" },
    { contractStart: "2026-12-31", contractEnd: "2026-10-01" },
    { quota: 0 },
    { interval: 0 },
  ])("has no schedule while the contract is incomplete: %j", (change) => {
    expect(scheduleDeadlines({ ...FORM, ...change }, "2026-09-24")).toBeNull();
  });
});

describe("contractTypePrefix", () => {
  it("leads a contract note with the type, and with nothing when there is no contract", () => {
    expect(contractTypePrefix("probation")).toBe("Probation · ");
    expect(contractTypePrefix("regular")).toBe("Regular · ");
    expect(contractTypePrefix(null)).toBe("");
  });
});

describe("validateCreatorForm schedule", () => {
  const INPUT = {
    name: "Bagas",
    email: "bagas@example.com",
    contractStart: "2026-10-01",
    contractEnd: "2026-10-20",
    interval: 14,
    quota: 3,
    fixedRate: 500000,
    socialPlatform: "instagram" as const,
    socialUsername: "bagas",
    contractType: "regular" as const,
  };
  const TODAY = new Date("2026-09-24T05:00:00Z");

  // The admin places the contents the auto schedule cannot fit by hand on the calendar.
  it("leaves a contract too short for the auto schedule to the calendar", () => {
    expect(validateCreatorForm(INPUT, TODAY)).toEqual({});
  });
});
