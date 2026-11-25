import { ACCESS_CLOSED, LOGIN_ERROR_MESSAGES, loginErrorMessage, type LoginError } from "./login-errors";

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

  // PBI-23's one message for every account without access, PBI-37's closed creator included.
  it("is PBI-23's message for an account without access", () => {
    expect(ACCESS_CLOSED).toBe("Akun ini tidak punya akses ke Tofly. Hubungi tim Tofly kalau ada pertanyaan.");
  });

  // OWASP A07: the backend answers not_authorized alike for an email never added and a creator
  // whose access closed (37.1), so the page says the same to both and never tells them apart.
  it("tells a refused account, closed or never added, that it has no access", () => {
    expect(loginErrorMessage("not_authorized")).toBe(ACCESS_CLOSED);
  });

  // OWASP A07: only that refusal says so; every other way back keeps its own words.
  it.each(["sign_in_failed", "cancelled", "session_expired"] satisfies LoginError[])(
    "never shows the no-access message for %s",
    (code) => {
      expect(loginErrorMessage(code)).not.toBe(ACCESS_CLOSED);
    },
  );

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
