import { EMAIL_SIGN_IN_TEXT, limitedText, wrongCodeText } from "./email-sign-in-messages";

// PBI-39's wording, word for word: QA signs the screens off against these sentences.
describe("email sign-in wording", () => {
  it("says a code was sent without saying whether the email is registered (AC 2)", () => {
    expect(EMAIL_SIGN_IN_TEXT.sent).toBe("Kalau email kamu terdaftar, kode sudah dikirim.");
  });

  it.each([
    [1, "Terlalu banyak permintaan. Coba lagi dalam 1 menit."],
    [45, "Terlalu banyak permintaan. Coba lagi dalam 45 menit."],
  ])("asks to wait %i minutes after too many requests (AC 5)", (minutes, text) => {
    expect(limitedText(minutes)).toBe(text);
  });

  it("says the code could not be sent (AC 6)", () => {
    expect(EMAIL_SIGN_IN_TEXT.sendFailed).toBe("Kode gagal dikirim. Coba lagi.");
  });

  it.each([
    [4, "Kode salah. Sisa 4 percobaan."],
    [1, "Kode salah. Sisa 1 percobaan."],
  ])("names the attempts left after a wrong code (AC 7)", (left, text) => {
    expect(wrongCodeText(left)).toBe(text);
  });

  it("says an expired code needs a new one (AC 9)", () => {
    expect(EMAIL_SIGN_IN_TEXT.expired).toBe("Kode sudah kedaluwarsa. Kirim ulang kode.");
  });

  it("refuses a revoked creator in the words of AC 11", () => {
    expect(EMAIL_SIGN_IN_TEXT.denied).toBe("Akses ditolak");
  });

  it("has its own words for a sign-in that failed for another reason", () => {
    expect(EMAIL_SIGN_IN_TEXT.signInFailed).toBe("Gagal masuk. Coba lagi.");
  });
});
