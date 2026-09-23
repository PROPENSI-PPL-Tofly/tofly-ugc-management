import { validateCreatorForm } from "./creator-form";

describe("validateCreatorForm", () => {
  it("requires a name", () => {
    const errors = validateCreatorForm({ name: "" });

    expect(errors.name).toBe("Nama wajib diisi");
  });

  // `email` does not exist on CreatorFormInput yet — GREEN adds it alongside the check.
  it("rejects an invalid email format", () => {
    const errors = validateCreatorForm({ name: "Bagas", email: "not-an-email" } as never);

    expect(errors.email).toBe("Format email tidak valid");
  });
});
