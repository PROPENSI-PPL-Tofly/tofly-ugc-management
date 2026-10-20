// What an invoice's comment thread says when reading or adding is refused or fails (PBI-13,
// subtask 13.4). Kept here, not in the server action's file: a "use server" file may export
// async functions only.

export const COMMENTS_FORBIDDEN = "Hanya admin yang dapat membuka komentar invoice ini.";
export const COMMENTS_UNAVAILABLE = "Komentar tidak bisa dimuat.";
export const COMMENT_FORBIDDEN = "Hanya admin yang dapat menambah komentar di sini.";
export const COMMENT_FAILED = "Komentar gagal dikirim. Coba lagi.";

// The longest comment, as the prototype's box and PRD 13.2 set it, counted once trimmed.
export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_EMPTY = "Komentar wajib diisi.";
export const COMMENT_TOO_LONG = "Komentar maksimal 500 karakter.";

// The comment as it is sent: without the spaces around it.
export function commentText(text: string): string {
  return text.trim();
}

// What is wrong with a comment, in the admin's words, or null when it can be sent.
export function validateComment(text: string): string | null {
  const sent = commentText(text);
  if (sent === "") return COMMENT_EMPTY;
  return sent.length > COMMENT_MAX_LENGTH ? COMMENT_TOO_LONG : null;
}
