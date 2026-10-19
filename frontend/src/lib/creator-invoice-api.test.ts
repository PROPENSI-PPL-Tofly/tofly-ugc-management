import { isRawCreatorInvoices, toCreatorInvoices, type RawCreatorInvoice } from "./creator-invoice-api";
import { RAW_MY_PAID, RAW_MY_RUNNING } from "./creator-invoice-api.fixture";
import { toInvoiceBreakdown } from "./invoice-api";
import { RAW_UPCOMING_NO_FORMULA } from "./invoice-api.fixture";

function only(raw: RawCreatorInvoice) {
  const [invoice] = toCreatorInvoices({ items: [raw] });
  return invoice;
}

describe("toCreatorInvoices", () => {
  it("names the invoice by its contract and period", () => {
    expect(only(RAW_MY_RUNNING)).toMatchObject({
      contractId: RAW_MY_RUNNING.contract.id,
      periodNumber: 2,
      periodStart: "2026-09-01",
      periodEnd: "2026-11-30",
      notStarted: false,
      status: "accruing",
    });
  });

  it("takes the amounts as the backend worked them out, keeping a waiting bonus unknown", () => {
    expect(only(RAW_MY_RUNNING)).toMatchObject({
      fixedAmount: 500000,
      extraAmount: 200000,
      bonusAmount: null,
      penaltyAmount: 150000,
      totalAmount: 550000,
      floored: false,
    });
  });

  it("reads the breakdown the way the admin's popups read it, so both see the same lines", () => {
    expect(only(RAW_MY_RUNNING).breakdown).toEqual(toInvoiceBreakdown(RAW_MY_RUNNING));
  });

  it("counts a fee or penalty still waiting for a formula as nothing charged yet", () => {
    const invoice = only({ ...RAW_UPCOMING_NO_FORMULA, acknowledgedAt: null, paidAt: null, paymentProof: null, comments: [] });

    expect(invoice).toMatchObject({ extraAmount: 0, penaltyAmount: 0, bonusAmount: null, notStarted: true });
  });

  it("dates each step the invoice has reached: Final by its snapshot, Bukti Bayar by the proof's upload", () => {
    expect(only(RAW_MY_PAID).reachedAt).toEqual({
      finalized: "2026-09-02T02:00:00Z",
      creator_acked: "2026-09-03T02:00:00Z",
      payment_uploaded: "2026-09-05T02:00:00Z",
      paid: "2026-09-06T02:00:00Z",
    });
  });

  it("lists the adjustments with what the creator reads, without who recorded them", () => {
    expect(only(RAW_MY_PAID).adjustments).toEqual([
      {
        id: "adadadad-0000-4000-8000-000000000001",
        amount: 50000,
        reason: "Bonus kampanye Agustus",
        createdAt: "2026-09-01T02:00:00Z",
      },
    ]);
  });

  it("keeps the payment proof with its link, file name and upload moment", () => {
    expect(only(RAW_MY_PAID).proof).toEqual({
      url: "https://files.tofly.test/proofs/rangga-1.pdf?token=abc",
      fileName: "transfer-rangga-agustus.pdf",
      uploadedAt: "2026-09-05T02:00:00Z",
    });
  });

  it("has no proof before the admin uploads one", () => {
    expect(only(RAW_MY_RUNNING).proof).toBeNull();
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["plain HTTP", "http://files.tofly.test/proofs/rangga-1.pdf"],
    ["something that is not a URL", "not a url"],
  ])("keeps the proof but drops a link that is %s, so it can never run or leak in a click", (_, url) => {
    const proof = RAW_MY_PAID.paymentProof!;

    expect(only({ ...RAW_MY_PAID, paymentProof: { ...proof, url } }).proof).toEqual({ ...proof, url: null });
  });

  it("keeps the comments in the order the backend sends them, oldest first", () => {
    const later = { ...RAW_MY_RUNNING.comments[0], id: "c0c0c0c0-0000-4000-8000-000000000002", role: "admin" as const, authorName: "Admin Tofly", createdAt: "2026-10-11T03:00:00Z" };

    const comments = only({ ...RAW_MY_RUNNING, comments: [...RAW_MY_RUNNING.comments, later] }).comments;

    expect(comments.map((comment) => comment.id)).toEqual([RAW_MY_RUNNING.comments[0].id, later.id]);
    expect(comments[1]).toEqual({
      id: later.id,
      authorName: "Admin Tofly",
      authorRole: "admin",
      text: later.text,
      createdAt: "2026-10-11T03:00:00Z",
    });
  });

  it("reads an answer that predates the payment fields as an invoice with none of them yet", () => {
    const older = Object.fromEntries(
      Object.entries(RAW_MY_RUNNING).filter(([key]) => !["acknowledgedAt", "paidAt", "paymentProof", "comments"].includes(key)),
    ) as unknown as RawCreatorInvoice;

    expect(only(older)).toMatchObject({
      reachedAt: { finalized: null, creator_acked: null, payment_uploaded: null, paid: null },
      proof: null,
      comments: [],
    });
  });

  it("counts a fixed rate still waiting for a formula as nothing charged yet", () => {
    const fixedRate = { ...RAW_MY_RUNNING.components.fixedRate, amount: null, status: "waiting_for_data" as const };

    expect(only({ ...RAW_MY_RUNNING, components: { ...RAW_MY_RUNNING.components, fixedRate } }).fixedAmount).toBe(0);
  });

  it("reads an answer without adjustments as an invoice with none", () => {
    expect(only({ ...RAW_MY_RUNNING, adjustments: undefined as never }).adjustments).toEqual([]);
  });

  it("reads an empty list as no invoices", () => {
    expect(toCreatorInvoices({ items: [] })).toEqual([]);
  });
});

describe("isRawCreatorInvoices", () => {
  it("accepts the answer the page reads", () => {
    expect(isRawCreatorInvoices({ items: [RAW_MY_RUNNING, RAW_MY_PAID] })).toBe(true);
  });

  it("accepts a creator with no invoices yet", () => {
    expect(isRawCreatorInvoices({ items: [] })).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["a bare list", [RAW_MY_RUNNING]],
    ["items that are not a list", { items: "none" }],
    ["an item that is not an object", { items: [42] }],
    ["an item without its contract", { items: [{ ...RAW_MY_RUNNING, contract: undefined }] }],
    ["a contract without an id", { items: [{ ...RAW_MY_RUNNING, contract: { ...RAW_MY_RUNNING.contract, id: 7 } }] }],
    ["a status from no pipeline", { items: [{ ...RAW_MY_RUNNING, invoiceStatus: "refunded" }] }],
    ["a total that is not a number", { items: [{ ...RAW_MY_RUNNING, total: "550000" }] }],
    [
      "a component without its lines",
      {
        items: [
          {
            ...RAW_MY_RUNNING,
            components: { ...RAW_MY_RUNNING.components, penalty: { amount: 0, status: "calculated" } },
          },
        ],
      },
    ],
    ["components missing altogether", { items: [{ ...RAW_MY_RUNNING, components: null }] }],
  ])("refuses %s, which the page could not render", (_, body) => {
    expect(isRawCreatorInvoices(body)).toBe(false);
  });
});
