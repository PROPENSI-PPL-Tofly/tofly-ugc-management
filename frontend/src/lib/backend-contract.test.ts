// Consumer contract tests for PBI-13: each adapter is fed what the backend really answered (see
// backend-contract.fixture.ts), not what its own fixture assumed. The pages' own tests already
// prove what each page does with its names; these prove the names arrive.

import {
  ADMIN_LIST,
  ADMIN_POSTED_COMMENT,
  ADMIN_THREAD,
  ADMIN_UPLOADED_PROOF,
  CREATOR_POSTED_COMMENT,
  ME_INVOICES,
} from "./backend-contract.fixture";
import { isRawCreatorInvoices, toCreatorInvoices, toSavedComment } from "./creator-invoice-api";
import { toInvoiceList, type RawInvoiceList } from "./invoice-api";
import {
  isRawInvoiceComment,
  toInvoiceComment,
  toInvoiceComments,
  type RawInvoiceComment,
} from "./invoice-comments-api";
import { isRawPaymentProof, toPaymentProof } from "./invoice-payment-api";

const PAID_CONTRACT = "37b446a2-0b19-4c18-9d65-b0f1b7078f97";

describe("the creator's Pembayaran page reads GET /me/invoices as the backend sends it", () => {
  it("accepts the answer and keeps every invoice", () => {
    expect(isRawCreatorInvoices(ME_INVOICES)).toBe(true);
    expect(toCreatorInvoices(ME_INVOICES as never)).toHaveLength(2);
  });

  it("knows who wrote each comment, the admin and the creator", () => {
    const [paid] = toCreatorInvoices(ME_INVOICES as never);

    expect(paid.comments.map(({ authorName, authorRole }) => [authorName, authorRole])).toEqual([
      ["Adit Prakoso", "creator"],
      ["Admin", "admin"],
      ["Adit Prakoso", "creator"],
    ]);
  });

  // The proof opens through this app's /api proxy, which checks the session first: a same-site
  // path, never a link to another site (OWASP A01, A05).
  it("offers the proof through the creator's own same-site route", () => {
    const [paid] = toCreatorInvoices(ME_INVOICES as never);

    expect(paid.proof).toEqual({
      fileName: "proof.pdf",
      url: `/api/me/invoices/${PAID_CONTRACT}/payment-proof`,
      uploadedAt: "2026-10-20T05:23:38.854Z",
    });
  });

  it("dates each step from the moves the backend recorded", () => {
    const [paid, running] = toCreatorInvoices(ME_INVOICES as never);

    expect(paid.status).toBe("paid");
    expect(Object.values(paid.reachedAt).every((at) => typeof at === "string")).toBe(true);
    expect(running.reachedAt).toEqual({
      finalized: null,
      creator_acked: null,
      payment_uploaded: null,
      paid: null,
    });
  });

  it("shows a comment the creator just sent without reading every invoice again", () => {
    expect(toSavedComment(CREATOR_POSTED_COMMENT)).toMatchObject({
      authorName: "Adit Prakoso",
      authorRole: "creator",
      text: "Sudah masuk, terima kasih!",
    });
  });
});

describe("the admin's Rincian panel reads the payment routes as the backend sends them", () => {
  it("names the role of every comment in the thread", () => {
    expect(toInvoiceComments(ADMIN_THREAD as RawInvoiceComment[]).map(({ author, role }) => [author, role])).toEqual([
      ["Adit Prakoso", "creator"],
      ["Admin", "admin"],
      ["Adit Prakoso", "creator"],
    ]);
  });

  it("takes the comment it just posted as saved, with its role", () => {
    expect(isRawInvoiceComment(ADMIN_POSTED_COMMENT)).toBe(true);
    expect(toInvoiceComment(ADMIN_POSTED_COMMENT as RawInvoiceComment)).toMatchObject({
      author: "Admin",
      role: "admin",
    });
  });

  it("takes the uploaded proof and links it through the admin's same-site route", () => {
    expect(isRawPaymentProof(ADMIN_UPLOADED_PROOF)).toBe(true);
    expect(toPaymentProof(ADMIN_UPLOADED_PROOF as never)).toEqual({
      fileName: "proof.pdf",
      href: `/api/invoices/${PAID_CONTRACT}/payment-proof`,
      uploadedAt: "2026-10-20T05:23:38.854Z",
    });
  });

  it("reads when the creator acknowledged and confirmed receipt on each row", () => {
    const rows = toInvoiceList(ADMIN_LIST as RawInvoiceList).rows;

    expect(rows.every(({ payment }) => payment !== undefined)).toBe(true);
    expect(rows.map(({ payment }) => payment?.acknowledgedAt ?? null)).toContain(null);
  });
});
