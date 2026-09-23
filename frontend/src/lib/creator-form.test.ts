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
    const errors = validateCreatorForm({
      ...VALID_INPUT,
      contractStart: "2026-10-10",
      contractEnd: "2026-10-01",
    });

    expect(errors.contractStart).toBe("Tanggal mulai tidak boleh setelah tanggal berakhir");
  });
});
