import { skippedInvoices, toggleAllOnPage, toggleId } from "./bulk-selection";
import type { InvoiceRow } from "@/lib/invoice";

const ROW: InvoiceRow = {
  creatorId: "creator-rangga",
  creatorName: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 500000,
  extraAmount: 0,
  bonusAmount: null,
  penaltyAmount: 0,
  totalAmount: 500000,
  floored: false,
  invoiceStatus: "accruing",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractEnd: "2026-12-31",
  adjustments: [],
  frozenAt: null,
  dataWaiting: false,
  pendingBonus: null,
  periodNumber: 2,
};

describe("bulk selection (31.5)", () => {
  it("ticks and unticks one row without changing the others", () => {
    expect(toggleId([], ROW.contractId)).toEqual([ROW.contractId]);
    expect(toggleId([ROW.contractId, "other"], ROW.contractId)).toEqual(["other"]);
  });

  it("selects every row on the page once, and clears them all on a second press", () => {
    const ids = [ROW.contractId, "other"];
    expect(toggleAllOnPage([], ids)).toEqual(ids);
    expect(toggleAllOnPage([ROW.contractId], ids)).toEqual(ids);
    expect(toggleAllOnPage(ids, ids)).toEqual([]);
  });

  it("lists only the selected Running or Cancelled invoices with the reason", () => {
    const rows = [
      { ...ROW, invoiceStatus: "accruing" as const },
      { ...ROW, contractId: "final-id", creatorName: "Hana", invoiceStatus: "paid" as const },
      { ...ROW, contractId: "cancel-id", creatorName: "Dimas", periodNumber: 1, invoiceStatus: "cancelled" as const },
    ];

    expect(
      skippedInvoices(rows, [ROW.contractId, "final-id", "cancel-id"]),
    ).toEqual([
      { title: "Rangga Pratama · Periode 2", label: "Berjalan" },
      { title: "Dimas", label: "Cancelled" },
    ]);
  });

  it("does not report a skipped invoice that was not ticked", () => {
    expect(skippedInvoices([ROW], [])).toEqual([]);
  });
});
