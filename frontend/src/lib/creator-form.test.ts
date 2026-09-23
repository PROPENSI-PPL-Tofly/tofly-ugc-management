import { validateCreatorForm } from "./creator-form";

describe("validateCreatorForm", () => {
  it("requires a name", () => {
    const errors = validateCreatorForm({ name: "", email: "bagas@example.com" });

    expect(errors.name).toBe("Nama wajib diisi");
  });

  it("rejects an invalid email format", () => {
    const errors = validateCreatorForm({ name: "Bagas", email: "not-an-email" });

    expect(errors.email).toBe("Format email tidak valid");
  });

  // contractStart/contractEnd do not exist on CreatorFormInput yet — GREEN adds them.
  it("rejects a contract start after the contract end", () => {
    const errors = validateCreatorForm({
      name: "Bagas",
      email: "bagas@example.com",
      contractStart: "2026-10-10",
      contractEnd: "2026-10-01",
    } as never);

    expect(errors.contractStart).toBe("Tanggal mulai tidak boleh setelah tanggal berakhir");
  });
});
