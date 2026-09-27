import { LOGIN_ERROR_MESSAGES, loginErrorMessage } from "./login-errors";

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
  it("tells a refused email to ask the Admin for access or use another Google account", () => {
    expect(loginErrorMessage("not_authorized")).toBe(
      "Email ini tidak punya akses ke Tofly. Hubungi Admin untuk meminta akses, atau masuk dengan akun Google lain.",
    );
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
