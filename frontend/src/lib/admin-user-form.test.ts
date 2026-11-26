import {
  adminRefusal,
  canChangeRole,
  canDeactivate,
  validateAdminForm,
} from "./admin-user-form";

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

describe("the API's refusals", () => {
  it("puts a taken email under the email field in the AC's words", () => {
    expect(adminRefusal("EMAIL_TAKEN")).toEqual({
      message: "Email sudah dipakai",
      errors: { email: "Email sudah dipakai" },
    });
  });

  it("puts the last Super Admin under the role field, so the form says which field to fix", () => {
    expect(adminRefusal("LAST_SUPER_ADMIN")).toEqual({
      message: "Minimal harus ada satu Super Admin",
      errors: { role: "Minimal harus ada satu Super Admin" },
    });
  });

  it("names a self role change on the role field and a self deactivation on the action", () => {
    expect(adminRefusal("SELF_ROLE")).toEqual({
      message: "Peran sendiri tidak bisa diubah",
      errors: { role: "Peran sendiri tidak bisa diubah" },
    });
    expect(adminRefusal("SELF_DEACTIVATE")).toEqual({
      message: "Super Admin tidak bisa menonaktifkan dirinya sendiri",
      errors: {},
    });
  });

  it("has nothing to say about a code it does not know", () => {
    expect(adminRefusal("SOMETHING_ELSE")).toBeNull();
  });
});

describe("self actions", () => {
  it("shuts the role change and the deactivation on the caller's own row", () => {
    expect(canChangeRole({ isSelf: true })).toBe(false);
    expect(canChangeRole({ isSelf: false })).toBe(true);
    expect(canDeactivate({ isSelf: true, isActive: true })).toBe(false);
  });

  it("offers deactivation only on an admin who is still active", () => {
    expect(canDeactivate({ isSelf: false, isActive: true })).toBe(true);
    expect(canDeactivate({ isSelf: false, isActive: false })).toBe(false);
  });
});
