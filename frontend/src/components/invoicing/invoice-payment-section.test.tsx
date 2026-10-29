import { act, fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceStatus } from "@/lib/invoice";
import type { PaymentProof } from "@/lib/invoice-payment-api";
import { InvoicePaymentSection } from "./invoice-payment-section";

// The real upload is a server action; the section must never reach it here.
vi.mock("@/lib/invoice-payment-actions.server", () => ({ uploadPaymentProof: vi.fn() }));

const CONTRACT = "11111111-1111-4111-8111-111111111111";
const PROOF: PaymentProof = {
  fileName: "bukti.pdf",
  href: `/api/invoices/${CONTRACT}/payment-proof`,
  uploadedAt: "2026-10-20T08:00:00.000Z",
};

function renderSection(status: InvoiceStatus, upload = vi.fn()) {
  const onUploaded = vi.fn();
  render(<InvoicePaymentSection contractId={CONTRACT} status={status} upload={upload} onUploaded={onUploaded} />);
  return { onUploaded };
}

describe("InvoicePaymentSection", () => {
  it("offers the proof upload while the creator has acknowledged the invoice", () => {
    renderSection("creator_acked");

    expect(screen.getByLabelText("File bukti pembayaran")).toBeInTheDocument();
  });

  it.each(["accruing", "finalized", "payment_uploaded", "paid"] as const)(
    "offers nothing while the invoice is %s: no proof is asked for",
    (status) => {
      const { container } = render(
        <InvoicePaymentSection contractId={CONTRACT} status={status} upload={vi.fn()} onUploaded={vi.fn()} />,
      );

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("says the proof went out and links it, offering no second upload, while the table reads again", async () => {
    const upload = vi.fn().mockResolvedValue({ ok: true, proof: PROOF });
    const { onUploaded } = renderSection("creator_acked", upload);

    fireEvent.change(screen.getByLabelText("File bukti pembayaran"), {
      target: { files: [new File(["%PDF-1.7"], "bukti.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload bukti" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kirim Bukti" })));

    expect(onUploaded).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Bukti bayar terkirim");
    expect(screen.getByRole("link", { name: "bukti.pdf" })).toHaveAttribute("href", PROOF.href);
    expect(screen.queryByLabelText("File bukti pembayaran")).not.toBeInTheDocument();
  });
});
