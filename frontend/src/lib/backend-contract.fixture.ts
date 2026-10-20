// What the backend really answers on the PBI-13 routes, recorded from a running backend
// (integration of #107-#110 at 42fde74, seeded database, 2026-10-20) and kept verbatim as the JSON
// files in backend-contract/. The frontend's own fixtures describe what each page expects; these
// pin what it is sent, so a field or route the two sides name differently fails a test instead of
// the page (consumer contract). Re-record the files when a backend answer changes. Test data only.

import adminList from "./backend-contract/admin-list.json";
import adminPostedComment from "./backend-contract/admin-posted-comment.json";
import adminThread from "./backend-contract/admin-thread.json";
import adminUploadedProof from "./backend-contract/admin-uploaded-proof.json";
import creatorConfirmedReceipt from "./backend-contract/creator-confirmed-receipt.json";
import creatorPostedComment from "./backend-contract/creator-posted-comment.json";
import meInvoices from "./backend-contract/me-invoices.json";

/** GET /me/invoices, as Adit (period 2 paid with a proof and comments, period 1 running). */
export const ME_INVOICES: unknown = meInvoices;

/** POST /me/invoices/:contractId/comments, as Adit. */
export const CREATOR_POSTED_COMMENT: unknown = creatorPostedComment;

/** POST /me/invoices/:contractId/confirm-receipt, as Adit. */
export const CREATOR_CONFIRMED_RECEIPT: unknown = creatorConfirmedReceipt;

/** GET /invoices/:contractId/comments, as an admin. */
export const ADMIN_THREAD: unknown = adminThread;

/** POST /invoices/:contractId/comments, as an admin. */
export const ADMIN_POSTED_COMMENT: unknown = adminPostedComment;

/** POST /invoices/:contractId/payment-proof (multipart), as an admin. */
export const ADMIN_UPLOADED_PROOF: unknown = adminUploadedProof;

/** GET /invoices?q=Adit, as an admin. */
export const ADMIN_LIST: unknown = adminList;
