import { validateCreatorForm } from "./creator-form";

describe("validateCreatorForm", () => {
  it("requires a name", () => {
    const errors = validateCreatorForm({ name: "" });

    expect(errors.name).toBe("Nama wajib diisi");
  });
});
