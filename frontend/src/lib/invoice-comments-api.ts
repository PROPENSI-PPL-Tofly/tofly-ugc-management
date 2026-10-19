// The translation between an invoice's comment thread and the API that answers it (PBI-13,
// subtask 13.4). The field names are the ones agreed for 13.2; everything that knows them lives
// here (Adapter), so a rename on the backend changes this file only.

// One comment as the API answers it.
export interface RawInvoiceComment {
  id: string;
  authorName: string;
  role: "admin" | "creator";
  text: string;
  // ISO instant.
  createdAt: string;
}

// One comment as the thread shows it.
export interface InvoiceComment {
  id: string;
  author: string;
  role: "admin" | "creator";
  text: string;
  createdAt: string;
}

// Whether an answer is a saved comment, as 13.2 answers a post to the thread.
export function isRawInvoiceComment(body: unknown): body is RawInvoiceComment {
  const comment = body as Partial<RawInvoiceComment> | null;
  return (
    typeof comment?.id === "string" &&
    typeof comment.text === "string" &&
    typeof comment.authorName === "string"
  );
}

export function toInvoiceComment(raw: RawInvoiceComment): InvoiceComment {
  return {
    id: raw.id,
    author: raw.authorName,
    role: raw.role,
    text: raw.text,
    createdAt: raw.createdAt,
  };
}

// The thread in the order the API sends it, which 13.2 makes oldest first.
export function toInvoiceComments(raw: readonly RawInvoiceComment[]): InvoiceComment[] {
  return raw.map(toInvoiceComment);
}
