import { downloadInvoicePdf, pdfDocumentsFor, pdfFileName } from "./invoice-pdf";

const CONTRACT = "22222222-2222-4222-8222-222222222222";

// Agreed 25 Nov 2026: the invoice once the creator acknowledged it, when nothing can change it
// any more; the receipt once the creator confirmed the payment arrived.
describe("pdfDocumentsFor", () => {
  it.each([
    ["accruing", []],
    ["finalized", []],
    ["creator_acked", ["invoice"]],
    ["payment_uploaded", ["invoice"]],
    ["paid", ["invoice", "receipt"]],
  ] as const)("offers %s invoices %j", (status, documents) => {
    expect(pdfDocumentsFor(status)).toEqual(documents);
  });
});

describe("pdfFileName", () => {
  it("reads the RFC 5987 name the backend sends", () => {
    expect(pdfFileName("attachment; filename*=UTF-8''Invoice_SitiNurhaliz%C3%A1_Periode1.pdf", "x.pdf")).toBe(
      "Invoice_SitiNurhalizá_Periode1.pdf",
    );
  });

  it("falls back when there is no usable name", () => {
    expect(pdfFileName(null, "Invoice.pdf")).toBe("Invoice.pdf");
    expect(pdfFileName("attachment", "Invoice.pdf")).toBe("Invoice.pdf");
    expect(pdfFileName("attachment; filename*=UTF-8''%E0%A4%A", "Invoice.pdf")).toBe("Invoice.pdf");
  });

  // OWASP Top 10:2025 A01: a name never carries a path.
  it("keeps only the last part of a name with slashes", () => {
    expect(pdfFileName("attachment; filename*=UTF-8''..%2F..%2Fevil.pdf", "x.pdf")).toBe("evil.pdf");
  });
});

describe("downloadInvoicePdf", () => {
  const createObjectURL = vi.fn(() => "blob:invoice");
  const revokeObjectURL = vi.fn();
  let click: { mock: { contexts: unknown[] } };
  /** The link the download clicked, if any. */
  const clicked = () => (click.mock.contexts[0] as HTMLAnchorElement | undefined) ?? null;

  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function respond(status: number, body: BodyInit | null = null, headers: HeadersInit = {}) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers }));
  }

  it.each([
    ["admin", "invoice", `/api/invoices/${CONTRACT}/invoice-pdf`],
    ["admin", "receipt", `/api/invoices/${CONTRACT}/receipt-pdf`],
    ["creator", "invoice", `/api/me/invoices/${CONTRACT}/invoice-pdf`],
    ["creator", "receipt", `/api/me/invoices/${CONTRACT}/receipt-pdf`],
  ] as const)("asks the %s route for the %s through the proxy and saves it under its name", async (audience, document, path) => {
    const fetchSpy = respond(200, "%PDF-1.3", {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename*=UTF-8''Invoice_RanggaPratama_Periode2.pdf",
    });

    await expect(downloadInvoicePdf(CONTRACT, audience, document)).resolves.toEqual({
      ok: true,
      fileName: "Invoice_RanggaPratama_Periode2.pdf",
    });
    expect(fetchSpy).toHaveBeenCalledWith(path, { method: "GET" });
    expect(clicked()?.download).toBe("Invoice_RanggaPratama_Periode2.pdf");
    expect(clicked()?.href).toBe("blob:invoice");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:invoice");
  });

  it.each([409, 500, 404])("says the PDF could not be made for a %s (AC 5)", async (status) => {
    respond(status, "{}");

    await expect(downloadInvoicePdf(CONTRACT, "admin", "invoice")).resolves.toEqual({
      ok: false,
      message: "PDF gagal dibuat. Coba lagi.",
    });
    expect(clicked()).toBeNull();
  });

  it("says the invoice is not theirs for a 403 (AC 6)", async () => {
    respond(403, "{}");

    await expect(downloadInvoicePdf(CONTRACT, "creator", "receipt")).resolves.toEqual({
      ok: false,
      message: "Kamu tidak punya akses ke invoice ini.",
    });
  });

  it("refuses an answer that is not a PDF", async () => {
    respond(200, "<html>", { "content-type": "text/html" });

    await expect(downloadInvoicePdf(CONTRACT, "admin", "invoice")).resolves.toMatchObject({ ok: false });
    expect(clicked()).toBeNull();
  });

  it("says the same when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(downloadInvoicePdf(CONTRACT, "admin", "invoice")).resolves.toMatchObject({ ok: false });
  });

  it("never calls the server for an id that is not a UUID", async () => {
    const fetchSpy = respond(200, "%PDF");

    await expect(downloadInvoicePdf("../x", "admin", "invoice")).resolves.toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
