// Answers of GET /me/invoices for the tests of the modules that read them. The invoice part is
// the admin detail's own fixture, since 13.1 answers a creator with the same breakdown; the
// payment fields are named as the admin's Rate & Invoicing reads them (13.4, PR #107), so the
// backend serves one shape to both. Test data only: nothing the app renders imports this.

import type { RawCreatorInvoice } from "./creator-invoice-api";
import { RAW_RANGGA_DETAIL } from "./invoice-api.fixture";

/** Rangga's second contract, still running: nothing past Berjalan, no proof, one comment. */
export const RAW_MY_RUNNING: RawCreatorInvoice = {
  ...RAW_RANGGA_DETAIL,
  contract: { ...RAW_RANGGA_DETAIL.contract, period: 2 },
  acknowledgedAt: null,
  paidAt: null,
  paymentProof: null,
  comments: [
    {
      id: "c0c0c0c0-0000-4000-8000-000000000001",
      authorName: "Rangga Pratama",
      authorRole: "creator",
      text: "Konten Promo akhir bulan sudah saya submit ya.",
      createdAt: "2026-10-10T03:00:00Z",
    },
  ],
};

/** Rangga's first contract: paid for in full, proof and every step on record. */
export const RAW_MY_PAID: RawCreatorInvoice = {
  ...RAW_RANGGA_DETAIL,
  contract: {
    id: "5a5a5a5a-0000-4000-8000-000000000001",
    status: "expired",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    lastDay: "2026-08-31",
    period: 1,
  },
  periodNumber: 1,
  invoiceStatus: "paid",
  rawTotal: 1200000,
  total: 1200000,
  adjustments: [
    {
      id: "adadadad-0000-4000-8000-000000000001",
      amount: 50000,
      reason: "Bonus kampanye Agustus",
      actorId: "a0a0a0a0-0000-4000-8000-000000000001",
      createdAt: "2026-09-01T02:00:00Z",
    },
  ],
  snapshot: { finalizedAt: "2026-09-02T02:00:00Z" },
  acknowledgedAt: "2026-09-03T02:00:00Z",
  paidAt: "2026-09-06T02:00:00Z",
  paymentProof: {
    url: "https://files.tofly.test/proofs/rangga-1.pdf?token=abc",
    fileName: "transfer-rangga-agustus.pdf",
    uploadedAt: "2026-09-05T02:00:00Z",
  },
  comments: [],
};
