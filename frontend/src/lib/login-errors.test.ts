import { ACCESS_CLOSED, LOGIN_ERROR_MESSAGES, loginErrorMessage } from "./login-errors";

describe("loginErrorMessage", () => {
  it("explains a failed sign-in and asks to try again", () => {
    expect(loginErrorMessage("sign_in_failed")).toBe(LOGIN_ERROR_MESSAGES.sign_in_failed);
    expect(LOGIN_ERROR_MESSAGES.sign_in_failed).toBe("Gagal masuk dengan Google. Silakan coba lagi.");
  });

  it("explains a sign-in cancelled on the Google screen", () => {
    expect(loginErrorMessage("cancelled")).toBe(
      "Masuk dibatalkan. Pilih akun Google Anda untuk melanjutkan.",
    );
  });

  // PRD 3.1: an email the whitelist refuses is told to contact the Admin. That covers one never
  // added and a creator whose access was revoked (flow 4.10), so it must not claim either. The
  // Google screen always offers the account chooser, so trying another account is a real way out.
  // PBI-23 AC: one message for everyone without access (an email that is not registered, a
  // deactivated Admin, a creator whose access is closed), the same on the Google and email-code
  // paths, so the page never tells which of them the address is (OWASP A07).
  it("tells a refused account it has no access, in the one wording PBI-23 sets", () => {
    expect(loginErrorMessage("not_authorized")).toBe("Akun ini tidak punya akses ke Tofly. Hubungi tim Tofly kalau ada pertanyaan.");
    expect(ACCESS_CLOSED).toBe("Akun ini tidak punya akses ke Tofly. Hubungi tim Tofly kalau ada pertanyaan.");
  });

  // A revoked creator was registered once, so "not registered" would be untrue for them.
  it("does not say the email was never registered", () => {
    expect(LOGIN_ERROR_MESSAGES.not_authorized).not.toMatch(/belum didaftarkan/i);
  });

  // Not a failure to retry: the same account would be refused again, so it must not read as one.
  it("does not read a refused email as a failed sign-in", () => {
    expect(LOGIN_ERROR_MESSAGES.not_authorized).not.toBe(LOGIN_ERROR_MESSAGES.sign_in_failed);
  });

  it.each([
    ["no error", undefined],
    ["an unknown code", "server_error"],
    ["text someone typed into the link", "<script>alert(1)</script>"],
    ["an inherited property name", "toString"],
    ["a repeated parameter", ["cancelled", "cancelled"]],
  ])("shows nothing for %s", (_label, value) => {
    expect(loginErrorMessage(value)).toBeNull();
  });
});
