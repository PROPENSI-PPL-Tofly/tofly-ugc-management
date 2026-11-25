import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DownloadPdfResult } from "@/lib/invoice-pdf";
import { InvoiceDocumentButtons } from "./invoice-pdf-button";

const downloadInvoicePdf = vi.fn<(...args: unknown[]) => Promise<DownloadPdfResult>>();
vi.mock("@/lib/invoice-pdf", async (original) => ({
  ...(await original<typeof import("@/lib/invoice-pdf")>()),
  downloadInvoicePdf: (...args: unknown[]) => downloadInvoicePdf(...args),
}));

const CONTRACT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  downloadInvoicePdf.mockReset();
});

describe("InvoiceDocumentButtons", () => {
  it.each(["accruing", "finalized"] as const)("offers nothing for a %s invoice", (status) => {
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="admin" status={status} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the invoice once the creator acknowledged it", () => {
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="admin" status="creator_acked" />);

    expect(screen.getByRole("button", { name: "Unduh Invoice" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Unduh Receipt" })).not.toBeInTheDocument();
  });

  it("offers the invoice and the receipt once it is paid", () => {
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="creator" status="paid" />);

    expect(screen.getByRole("button", { name: "Unduh Invoice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unduh Receipt" })).toBeInTheDocument();
  });

  it("says it is making the file and takes no second press meanwhile", async () => {
    let finish: (result: DownloadPdfResult) => void = () => {};
    downloadInvoicePdf.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="creator" status="paid" />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Receipt" }));

    expect(screen.getByRole("button", { name: "Membuat PDF…" })).toBeDisabled();
    expect(downloadInvoicePdf).toHaveBeenCalledWith(CONTRACT, "creator", "receipt");
    await act(async () => finish({ ok: true, fileName: "Receipt_RanggaPratama_Periode2.pdf" }));
    expect(screen.getByRole("button", { name: "Unduh Receipt" })).toBeEnabled();
  });

  it("confirms the download with the file's name", async () => {
    downloadInvoicePdf.mockResolvedValue({ ok: true, fileName: "Invoice_RanggaPratama_Periode2.pdf" });
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="admin" status="paid" />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unduh Invoice" })));

    expect(screen.getByRole("status")).toHaveTextContent("Invoice_RanggaPratama_Periode2.pdf diunduh.");
  });

  it("says why when the file could not be made, and clears it on the next try (AC 5)", async () => {
    downloadInvoicePdf.mockResolvedValueOnce({ ok: false, message: "PDF gagal dibuat. Coba lagi." });
    render(<InvoiceDocumentButtons contractId={CONTRACT} audience="admin" status="creator_acked" />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unduh Invoice" })));
    expect(screen.getByRole("alert")).toHaveTextContent("PDF gagal dibuat. Coba lagi.");

    downloadInvoicePdf.mockResolvedValueOnce({ ok: true, fileName: "x.pdf" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unduh Invoice" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
