// Why a sign-in ended back on /login. The backend's Google callback sends one of these codes as
// `?error=`; the page shows the matching text and ignores anything else, so a crafted link can
// never make the login page say something the app did not write.

export type LoginError = "not_authorized" | "sign_in_failed" | "cancelled";

const SIGN_IN_FAILED = "Gagal masuk dengan Google. Silakan coba lagi.";

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  sign_in_failed: SIGN_IN_FAILED,
  cancelled: "Masuk dibatalkan. Pilih akun Google Anda untuk melanjutkan.",
  // The "email not registered, contact your Admin" wording is its own piece of work; until it
  // lands, a refused email reads as a failed sign-in rather than as nothing at all.
  not_authorized: SIGN_IN_FAILED,
};

function isLoginError(value: string): value is LoginError {
  return Object.hasOwn(LOGIN_ERROR_MESSAGES, value);
}

/** The text for a `?error=` value, or null for a normal visit or an unknown code. */
export function loginErrorMessage(value: string | string[] | undefined): string | null {
  return typeof value === "string" && isLoginError(value) ? LOGIN_ERROR_MESSAGES[value] : null;
}
