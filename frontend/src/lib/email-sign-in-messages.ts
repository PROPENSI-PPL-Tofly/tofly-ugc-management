// What the email-code sign-in screens say (PBI-39). The backend answers with codes only; the
// wording lives here, word for word as the acceptance criteria give it, so QA can check one file.

export const EMAIL_SIGN_IN_TEXT = {
  /** AC 2: the same for a registered and an unregistered email. */
  sent: "Kalau email kamu terdaftar, kode sudah dikirim.",
  /** AC 6. */
  sendFailed: "Kode gagal dikirim. Coba lagi.",
  /** AC 9, and AC 8's fifth wrong attempt, which the backend answers as expired. */
  expired: "Kode sudah kedaluwarsa. Kirim ulang kode.",
  /** AC 11: access that ended after the code was sent. */
  denied: "Akses ditolak",
  /** Not in the ACs: the backend could not finish signing in. */
  signInFailed: "Gagal masuk. Coba lagi.",
} as const;

/** AC 5. */
export function limitedText(minutes: number): string {
  return `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`;
}

/** AC 7. */
export function wrongCodeText(attemptsLeft: number): string {
  return `Kode salah. Sisa ${attemptsLeft} percobaan.`;
}
