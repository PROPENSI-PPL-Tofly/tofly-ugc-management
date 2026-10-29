// What the API answers about paying an invoice (PBI-13): the admin's payment proof and the
// invoice's comment thread. The frontend's adapters read these names.

/** A saved payment proof. */
export interface PaymentProofDto {
  fileName: string;
  /** A stable same-origin link; the backend checks access and opens the file only when followed. */
  url: string;
  /** ISO instant. */
  uploadedAt: string;
}

/** What an upload answers: the proof, and the status it moved the invoice to. */
export interface UploadedPaymentProofDto extends PaymentProofDto {
  invoiceStatus: 'payment_uploaded';
}

export type CommentAuthorRole = 'admin' | 'creator';

/** One comment, oldest first in a thread. */
export interface InvoiceCommentDto {
  id: string;
  /** "Admin" for every admin, never an email; the contract's creator by name. */
  authorName: string;
  authorRole: CommentAuthorRole;
  text: string;
  /** ISO instant. */
  createdAt: string;
}

/** The payment part of a Rate & Invoicing row and of the invoice detail. */
export interface InvoicePaymentFields {
  /** The proof the admin uploaded, or null before one is. */
  paymentProof: PaymentProofDto | null;
}
