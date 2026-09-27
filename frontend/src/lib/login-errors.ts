// Why a sign-in ended back on /login. The backend's Google callback sends one of these codes as
// `?error=`; the page shows the matching text and ignores anything else, so a crafted link can
// never make the login page say something the app did not write.

export type LoginError = "not_authorized" | "sign_in_failed" | "cancelled";

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  sign_in_failed: "Gagal masuk dengan Google. Silakan coba lagi.",
  cancelled: "Masuk dibatalkan. Pilih akun Google Anda untuk melanjutkan.",
  // PRD 3.1: not a failure to retry, since the same account would be refused again. Worded to
  // fit both an email never added and a creator whose access was revoked (flow 4.10). The Google
  // screen always offers the account chooser, so another account is a real way out.
  not_authorized:
    "Email ini tidak punya akses ke Tofly. Hubungi Admin untuk meminta akses, atau masuk dengan akun Google lain.",
};

function isLoginError(value: string): value is LoginError {
  return Object.hasOwn(LOGIN_ERROR_MESSAGES, value);
}

/** The text for a `?error=` value, or null for a normal visit or an unknown code. */
export function loginErrorMessage(value: string | string[] | undefined): string | null {
  return typeof value === "string" && isLoginError(value) ? LOGIN_ERROR_MESSAGES[value] : null;
}
