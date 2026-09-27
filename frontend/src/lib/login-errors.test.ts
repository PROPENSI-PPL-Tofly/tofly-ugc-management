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

  it("falls back to the failed-sign-in text for a refused email until its own wording lands", () => {
    expect(loginErrorMessage("not_authorized")).toBe(LOGIN_ERROR_MESSAGES.sign_in_failed);
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
