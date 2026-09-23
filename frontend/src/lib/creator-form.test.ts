import { validateCreatorForm } from "./creator-form";

describe("validateCreatorForm", () => {
  const VALID_INPUT = {
    name: "Bagas",
    email: "bagas@example.com",
    contractStart: "2026-10-01",
    contractEnd: "2026-12-31",
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
});
