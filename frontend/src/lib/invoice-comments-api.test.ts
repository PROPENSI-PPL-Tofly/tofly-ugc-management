import { toInvoiceComment, toInvoiceComments, type RawInvoiceComment } from "./invoice-comments-api";

// One comment on an invoice as the API answers it.
function raw(over: Partial<RawInvoiceComment> = {}): RawInvoiceComment {
  return {
    id: "c1",
    authorName: "Admin Tofly",
    authorRole: "admin",
    text: "Bukti transfer sudah diunggah ya.",
    createdAt: "2026-10-20T08:05:00.000Z",
    ...over,
  };
}

describe("toInvoiceComment", () => {
  it("names who wrote the comment, as which role, what they wrote and when", () => {
    expect(toInvoiceComment(raw())).toEqual({
      id: "c1",
      author: "Admin Tofly",
      role: "admin",
      text: "Bukti transfer sudah diunggah ya.",
      createdAt: "2026-10-20T08:05:00.000Z",
    });
  });

  it("keeps a creator's comment as the creator's", () => {
    expect(toInvoiceComment(raw({ authorName: "Rangga Pratama", authorRole: "creator" }))).toMatchObject({
      author: "Rangga Pratama",
      role: "creator",
    });
  });
});

describe("toInvoiceComments", () => {
  it("keeps the comments in the order the API sends them", () => {
    const first = raw({ id: "c1", createdAt: "2026-10-20T08:05:00.000Z" });
    const second = raw({ id: "c2", authorRole: "creator", createdAt: "2026-10-20T09:00:00.000Z" });

    expect(toInvoiceComments([first, second]).map((comment) => comment.id)).toEqual(["c1", "c2"]);
  });

  it("reads an invoice without comments as an empty thread", () => {
    expect(toInvoiceComments([])).toEqual([]);
  });
});
