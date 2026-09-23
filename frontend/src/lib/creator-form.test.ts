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
});
