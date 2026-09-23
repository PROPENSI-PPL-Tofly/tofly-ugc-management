import { validateCreatorForm } from "./creator-form";

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
  };

  it("requires a name", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, name: "" });

    expect(errors.name).toBe("Nama wajib diisi");
  });

  it("rejects an invalid email format", () => {
    const errors = validateCreatorForm({ ...VALID_INPUT, email: "not-an-email" });

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
