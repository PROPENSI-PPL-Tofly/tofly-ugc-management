import { toInvoicePayment, type RawInvoicePayment } from "./invoice-payment-api";

// An invoice the creator has acknowledged, paid for and confirmed, as the API would answer it.
function raw(over: Partial<RawInvoicePayment> = {}): RawInvoicePayment {
  return {
    acknowledgedAt: "2026-10-20T02:15:00.000Z",
    paidAt: "2026-10-21T09:30:00.000Z",
    paymentProof: {
      fileName: "bukti-transfer-oktober.pdf",
      url: "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
      uploadedAt: "2026-10-20T08:00:00.000Z",
    },
    ...over,
  };
}

describe("toInvoicePayment", () => {
  it("names when the creator acknowledged the invoice and when they confirmed receipt", () => {
    const payment = toInvoicePayment(raw());

    expect(payment.acknowledgedAt).toBe("2026-10-20T02:15:00.000Z");
    expect(payment.receivedAt).toBe("2026-10-21T09:30:00.000Z");
  });

  it("names the uploaded proof by its file name and the link that opens it", () => {
    expect(toInvoicePayment(raw()).proof).toEqual({
      fileName: "bukti-transfer-oktober.pdf",
      href: "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
      uploadedAt: "2026-10-20T08:00:00.000Z",
    });
  });

  it("has no proof before the admin uploads one", () => {
    expect(toInvoicePayment(raw({ paymentProof: null })).proof).toBeNull();
  });

  it("has no times before the creator acknowledges or confirms", () => {
    const payment = toInvoicePayment(raw({ acknowledgedAt: null, paidAt: null }));

    expect(payment.acknowledgedAt).toBeNull();
    expect(payment.receivedAt).toBeNull();
  });

  it("reads an answer that does not carry the payment fields yet as nothing happened", () => {
    expect(toInvoicePayment({})).toEqual({ acknowledgedAt: null, receivedAt: null, proof: null });
  });
});

describe("the proof's link", () => {
  function hrefOf(url: string): string | null {
    const proof = toInvoicePayment(
      raw({ paymentProof: { fileName: "bukti.pdf", url, uploadedAt: "2026-10-20T08:00:00.000Z" } }),
    ).proof;
    return proof!.href;
  }

  it.each([
    "https://storage.example.com/bukti.pdf?sig=abc",
    "http://localhost:3001/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
    "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
  ])("keeps %s, a web address or a path on this site", (url) => {
    expect(hrefOf(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "//evil.example/bukti.pdf",
    "/\\evil.example/bukti.pdf",
    "bukti.pdf",
    "",
  ])("offers no link for %j, keeping only the file's name", (url) => {
    expect(hrefOf(url)).toBeNull();
  });

  it("still names the file when its link is not offered", () => {
    expect(
      toInvoicePayment(
        raw({ paymentProof: { fileName: "bukti.pdf", url: "javascript:alert(1)", uploadedAt: "2026-10-20T08:00:00.000Z" } }),
      ).proof,
    ).toEqual({ fileName: "bukti.pdf", href: null, uploadedAt: "2026-10-20T08:00:00.000Z" });
  });
});
