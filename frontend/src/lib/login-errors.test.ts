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

  // PRD 3.1: a Google account that is not on the whitelist is told to contact the Admin. The
  // Google screen always offers the account chooser, so trying another account is a real way out.
  it("tells a refused email to ask the Admin for access or use another Google account", () => {
    expect(loginErrorMessage("not_authorized")).toBe(
      "Email ini belum didaftarkan oleh Admin. Hubungi Admin untuk meminta akses, atau masuk dengan akun Google lain.",
    );
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
