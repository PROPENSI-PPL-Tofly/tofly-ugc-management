import {
  ADMIN_EVENT_TEXT,
  adminInvoiceHint,
  adminInvoiceView,
  adminTotalLabel,
  adminTotalNote,
} from "./admin-invoice-view";
import { invoiceActivity } from "./creator-invoice";
import type { InvoiceRow } from "./invoice";
import type { InvoiceBreakdown } from "./invoice-breakdown";

const CONTRACT = "11111111-1111-4111-8111-111111111111";

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Maya Kusuma",
  fixed: {
    period: { number: 1, start: "2026-03-21", end: "2026-09-20", quotaDone: 2, quotaTotal: 6 },
    total: 2500000,
    notStarted: false,
  },
  extra: { lines: [], total: 0 },
  bonus: { lines: [], total: 0, performance: "ready", rules: { tiers: [], specificBonus: 0 } },
  penalty: { lines: [], total: 0 },
};

const ROW: InvoiceRow = {
  creatorId: "creator-maya",
  creatorName: "Maya Kusuma",
  contractId: CONTRACT,
  periodNumber: 1,
  contractStatus: "active",
  contractEnd: "2026-09-20",
  fixedAmount: 2500000,
  extraAmount: 0,
  bonusAmount: null,
  penaltyAmount: 0,
  totalAmount: 2500000,
  floored: false,
  dataWaiting: false,
  pendingBonus: null,
  invoiceStatus: "accruing",
  adjustments: [],
  frozenAt: null,
};

describe("adminInvoiceView", () => {
  it("reads a running invoice as the creator's page reads it, with nothing reached past Berjalan", () => {
    expect(adminInvoiceView(ROW, BREAKDOWN)).toEqual({
      contractId: CONTRACT,
      periodNumber: 1,
      periodStart: "2026-03-21",
      periodEnd: "2026-09-20",
      notStarted: false,
      status: "accruing",
      fixedAmount: 2500000,
      extraAmount: 0,
      bonusAmount: null,
      penaltyAmount: 0,
      adjustments: [],
      totalAmount: 2500000,
      floored: false,
      breakdown: BREAKDOWN,
      reachedAt: { finalized: null, creator_acked: null, payment_uploaded: null, paid: null },
      proof: null,
      comments: [],
    });
  });

  it("dates each step from the row: frozen, acknowledged, proof uploaded and confirmed", () => {
    const view = adminInvoiceView(
      {
        ...ROW,
        invoiceStatus: "paid",
        frozenAt: "2026-09-21T02:00:00.000Z",
        payment: {
          acknowledgedAt: "2026-09-22T02:00:00.000Z",
          receivedAt: "2026-09-24T02:00:00.000Z",
          proof: { fileName: "bukti.pdf", href: `/api/invoices/${CONTRACT}/payment-proof`, uploadedAt: "2026-09-23T02:00:00.000Z" },
        },
      },
      BREAKDOWN,
    );

    expect(view.reachedAt).toEqual({
      finalized: "2026-09-21T02:00:00.000Z",
      creator_acked: "2026-09-22T02:00:00.000Z",
      payment_uploaded: "2026-09-23T02:00:00.000Z",
      paid: "2026-09-24T02:00:00.000Z",
    });
    expect(view.proof).toEqual({
      fileName: "bukti.pdf",
      url: `/api/invoices/${CONTRACT}/payment-proof`,
      uploadedAt: "2026-09-23T02:00:00.000Z",
    });
  });

  it("takes the contract's last day when the breakdown does not know the period's dates", () => {
    const unknown = { ...BREAKDOWN, fixed: { ...BREAKDOWN.fixed, period: { ...BREAKDOWN.fixed.period, start: null, end: null } } };

    const view = adminInvoiceView(ROW, unknown);

    expect(view.periodStart).toBe("2026-09-20");
    expect(view.periodEnd).toBe("2026-09-20");
  });

  it("says a contract that has not started has nothing billed yet", () => {
    const upcoming = { ...BREAKDOWN, fixed: { ...BREAKDOWN.fixed, notStarted: true } };

    expect(adminInvoiceView(ROW, upcoming).notStarted).toBe(true);
  });
});

describe("adminTotalLabel", () => {
  it.each([
    ["accruing", "Total Sementara"],
    ["finalized", "Total Final"],
    ["creator_acked", "Total Final"],
    ["payment_uploaded", "Total Final"],
    ["paid", "Total Dibayarkan"],
  ] as const)("names a %s invoice's total %s", (status, label) => {
    expect(adminTotalLabel(status)).toBe(label);
  });
});

describe("adminTotalNote", () => {
  it.each(["accruing", "finalized"] as const)("says a %s total can still move until the creator acknowledges", (status) => {
    expect(adminTotalNote(status)).toBe("Bisa berubah sampai creator ack invoice.");
  });

  it.each(["creator_acked", "payment_uploaded", "paid"] as const)("adds nothing once a %s total is settled", (status) => {
    expect(adminTotalNote(status)).toBeNull();
  });
});

describe("adminInvoiceHint", () => {
  const view = adminInvoiceView(ROW, BREAKDOWN);

  it("says when a running invoice can be finalized: the day after the contract's last", () => {
    expect(adminInvoiceHint(view, "2026-09-20", "2026-09-20")).toBe("Finalize mulai 21 Sep 2026.");
  });

  it("crosses a month and a year to name that day", () => {
    expect(adminInvoiceHint(view, "2026-12-31", "2026-10-01")).toBe("Finalize mulai 1 Jan 2027.");
  });

  it("says nothing once a running invoice can be finalized: the button says it", () => {
    expect(adminInvoiceHint(view, "2026-09-20", "2026-09-21")).toBeNull();
  });

  it("says a contract that has not started is not billed yet", () => {
    expect(adminInvoiceHint({ ...view, notStarted: true }, "2026-09-20", "2026-01-01")).toBe("Kontrak belum dimulai.");
  });

  it.each([
    ["finalized", "Menunggu ack creator."],
    ["creator_acked", null],
    ["payment_uploaded", "Menunggu konfirmasi creator."],
    ["paid", "Lunas"],
  ] as const)("says whose move a %s invoice waits on", (status, hint) => {
    expect(adminInvoiceHint({ ...view, status }, "2026-09-20", "2026-10-01")).toBe(hint);
  });
});

describe("ADMIN_EVENT_TEXT", () => {
  it("tells the invoice's story in the admin's words", () => {
    const view = adminInvoiceView(
      {
        ...ROW,
        invoiceStatus: "creator_acked",
        frozenAt: "2026-09-21T02:00:00.000Z",
        payment: { acknowledgedAt: "2026-09-22T02:00:00.000Z", receivedAt: null, proof: null },
      },
      BREAKDOWN,
    );

    expect(invoiceActivity(view, ADMIN_EVENT_TEXT).map((entry) => entry.text)).toEqual([
      "Invoice difinalisasi",
      "Creator meng-acknowledge invoice",
    ]);
  });

  it("names every step past Berjalan", () => {
    expect(ADMIN_EVENT_TEXT).toEqual({
      finalized: "Invoice difinalisasi",
      creator_acked: "Creator meng-acknowledge invoice",
      payment_uploaded: "Bukti bayar dikirim ke creator",
      paid: "Creator mengonfirmasi pembayaran diterima",
    });
  });
});
