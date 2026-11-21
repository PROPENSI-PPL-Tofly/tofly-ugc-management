import { validateAdminForm } from "./admin-user-form";

const VALID = { name: "Rangga", email: "rangga@example.com", role: "admin" as const };

describe("the admin form's rules", () => {
  it("accepts a filled form", () => {
    expect(validateAdminForm(VALID, "create")).toEqual({});
  });

  it.each([
    ["a blank name", { name: "   " }, "name", "Nama wajib diisi"],
    ["a name past 100", { name: "a".repeat(101) }, "name", "Nama maksimal 100 karakter"],
    ["a blank email", { email: "" }, "email", "Email wajib diisi"],
    ["a malformed email", { email: "rangga@" }, "email", "Format email tidak valid"],
    [
      "an email past 254",
      { email: `${"a".repeat(250)}@x.yz` },
      "email",
      "Email maksimal 254 karakter",
    ],
    ["no role", { role: "" }, "role", "Pilih peran"],
  ] as const)("refuses %s and names it on its field", (_label, patch, field, message) => {
    expect(validateAdminForm({ ...VALID, ...patch }, "create")).toMatchObject({
      [field]: message,
    });
  });

  // An edit changes a name and a role; the email it was created with is not the form's to re-check.
  it("does not re-check the email an edit cannot change", () => {
    expect(validateAdminForm({ ...VALID, email: "not-an-email" }, "edit")).toEqual({});
  });
});
