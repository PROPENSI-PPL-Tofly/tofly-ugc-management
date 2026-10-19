// What an invoice's comment thread says when reading or adding is refused or fails (PBI-13,
// subtask 13.4). Kept here, not in the server action's file: a "use server" file may export
// async functions only.

export const COMMENTS_FORBIDDEN = "Hanya admin yang dapat membuka komentar invoice ini.";
export const COMMENTS_UNAVAILABLE = "Komentar tidak bisa dimuat.";
export const COMMENT_FORBIDDEN = "Hanya admin yang dapat menambah komentar di sini.";
export const COMMENT_FAILED = "Komentar gagal dikirim. Coba lagi.";
