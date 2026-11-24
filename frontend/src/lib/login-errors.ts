// Why a visit ended back on /login. The backend's Google callback sends most of these codes as
// `?error=`; the page shows the matching text and ignores anything else, so a crafted link can
// never make the login page say something the app did not write.

/**
 * PBI-23: the one message for everyone without access: an email never added, a deactivated Admin,
 * a creator whose access is closed. The same on the Google and email-code paths, so the page never
 * tells which of them an address is (OWASP A07). Not a failure to retry: the same account would be
 * refused again.
 */
export const ACCESS_CLOSED = "Akun ini tidak punya akses ke Tofly. Hubungi tim Tofly kalau ada pertanyaan.";

export type LoginError = "not_authorized" | "sign_in_failed" | "cancelled" | "session_expired";

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  sign_in_failed: "Gagal masuk dengan Google. Silakan coba lagi.",
  cancelled: "Masuk dibatalkan. Pilih akun Google Anda untuk melanjutkan.",
  // Set by the browser when an action came back 401 (lib/api-client.ts), not by the callback.
  session_expired: "Sesi Anda sudah berakhir. Silakan masuk lagi untuk melanjutkan.",
  not_authorized: ACCESS_CLOSED,
};

function isLoginError(value: string): value is LoginError {
  return Object.hasOwn(LOGIN_ERROR_MESSAGES, value);
}

/** The text for a `?error=` value, or null for a normal visit or an unknown code. */
export function loginErrorMessage(value: string | string[] | undefined): string | null {
  return typeof value === "string" && isLoginError(value) ? LOGIN_ERROR_MESSAGES[value] : null;
}
