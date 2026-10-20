import { toInvoiceList, type RawInvoiceList, type RawInvoiceRow } from "./invoice-api";
import { RAW_RANGGA } from "./invoice-api.fixture";
import { paymentOf } from "./invoice-payment-api";

// A page of one row, as GET /invoices answers it.
function listOf(row: RawInvoiceRow): RawInvoiceList {
  return {
    items: [row],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    summary: { total: row.total, runningInvoices: 0, formulaSet: true },
  };
}

// Rangga's invoice once the creator has acknowledged it and the admin has uploaded the proof.
const ACKNOWLEDGED_ROW: RawInvoiceRow = {
  ...RAW_RANGGA,
  invoiceStatus: "payment_uploaded",
  acknowledgedAt: "2026-10-20T02:15:00.000Z",
  paidAt: null,
  paymentProof: {
    fileName: "bukti.pdf",
    url: "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
    uploadedAt: "2026-10-20T08:00:00.000Z",
  },
};

describe("paymentOf", () => {
  it("carries the payment when the answer sends any of its fields", () => {
    expect(paymentOf({ acknowledgedAt: "2026-10-20T02:15:00.000Z" })).toEqual({
      payment: { acknowledgedAt: "2026-10-20T02:15:00.000Z", receivedAt: null, proof: null },
    });
  });

  it("adds nothing for an answer from before 13.1 and 13.2, which sends none of them", () => {
    expect(paymentOf({})).toEqual({});
  });
});

describe("the Rate & Invoicing row", () => {
  it("carries the payment GET /invoices sends with it, under the page's names", () => {
    expect(toInvoiceList(listOf(ACKNOWLEDGED_ROW)).rows[0].payment).toEqual({
      acknowledgedAt: "2026-10-20T02:15:00.000Z",
      receivedAt: null,
      proof: {
        fileName: "bukti.pdf",
        href: "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
        uploadedAt: "2026-10-20T08:00:00.000Z",
      },
    });
  });

  it("reads exactly as before for an answer without payment fields", () => {
    expect(toInvoiceList(listOf(RAW_RANGGA)).rows[0]).not.toHaveProperty("payment");
  });
});
