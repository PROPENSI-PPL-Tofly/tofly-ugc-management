import {
  COMMENT_EMPTY,
  COMMENT_MAX_LENGTH,
  COMMENT_TOO_LONG,
  commentText,
  validateComment,
} from "./invoice-comments";

describe("validateComment", () => {
  it.each(["Bukti transfer sudah diunggah ya.", "a", "x".repeat(500)])(
    "takes a comment with something to say, up to 500 characters (%#)",
    (text) => {
      expect(validateComment(text)).toBeNull();
    },
  );

  it("counts the 500 after trimming, so spaces around a full comment do not count", () => {
    expect(validateComment(`  ${"x".repeat(500)}  `)).toBeNull();
  });

  it.each(["", "   ", "\n\t "])("refuses a comment with nothing to say (%j)", (text) => {
    expect(validateComment(text)).toBe(COMMENT_EMPTY);
  });

  it("refuses a comment one character over 500", () => {
    expect(validateComment("x".repeat(501))).toBe(COMMENT_TOO_LONG);
  });

  it("holds the limit the prototype and PRD 13.2 set, and words each refusal in Indonesian", () => {
    expect(COMMENT_MAX_LENGTH).toBe(500);
    expect(COMMENT_EMPTY).toBe("Komentar wajib diisi.");
    expect(COMMENT_TOO_LONG).toBe("Komentar maksimal 500 karakter.");
  });
});

describe("commentText", () => {
  it("sends the comment without the spaces around it", () => {
    expect(commentText("  Halo, sudah dicek ya.  ")).toBe("Halo, sudah dicek ya.");
  });
});
