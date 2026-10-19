import { render, screen } from "@testing-library/react";
import { formatTimestamp } from "@/lib/format";
import type { InvoicePayment } from "@/lib/invoice-payment-api";
import { PaymentStatus } from "./payment-status";

// An invoice the creator has acknowledged and confirmed, with the admin's proof uploaded.
const SETTLED: InvoicePayment = {
  acknowledgedAt: "2026-10-20T02:15:00.000Z",
  receivedAt: "2026-10-21T09:30:00.000Z",
  proof: {
    fileName: "bukti-transfer-oktober.pdf",
    href: "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
    uploadedAt: "2026-10-20T08:00:00.000Z",
  },
};

const NOTHING_YET: InvoicePayment = { acknowledgedAt: null, receivedAt: null, proof: null };

// The value written beside a label, read from the term the label names.
function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label);
  return term.nextElementSibling as HTMLElement;
}

describe("PaymentStatus", () => {
  it("says when the creator acknowledged the invoice, in Jakarta time", () => {
    render(<PaymentStatus payment={SETTLED} />);

    expect(valueOf("Diakui creator")).toHaveTextContent(formatTimestamp("2026-10-20T02:15:00.000Z"));
    expect(valueOf("Diakui creator")).toHaveTextContent("20 Okt 2026, 09.15 WIB");
  });

  it("says when the creator confirmed receipt, in Jakarta time", () => {
    render(<PaymentStatus payment={SETTLED} />);

    expect(valueOf("Penerimaan dikonfirmasi")).toHaveTextContent("21 Okt 2026, 16.30 WIB");
  });

  it("names the uploaded proof by its file name, as a link that opens it", () => {
    render(<PaymentStatus payment={SETTLED} />);

    const link = screen.getByRole("link", { name: "bukti-transfer-oktober.pdf" });
    expect(link).toHaveAttribute(
      "href",
      "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof",
    );
  });

  it("says Belum for each step that has not happened yet, and offers no link", () => {
    render(<PaymentStatus payment={NOTHING_YET} />);

    expect(valueOf("Diakui creator")).toHaveTextContent("Belum");
    expect(valueOf("Penerimaan dikonfirmasi")).toHaveTextContent("Belum");
    expect(valueOf("Bukti pembayaran")).toHaveTextContent("Belum");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the acknowledgement while receipt still waits, as an invoice part way through", () => {
    render(<PaymentStatus payment={{ ...NOTHING_YET, acknowledgedAt: SETTLED.acknowledgedAt }} />);

    expect(valueOf("Diakui creator")).toHaveTextContent("20 Okt 2026, 09.15 WIB");
    expect(valueOf("Penerimaan dikonfirmasi")).toHaveTextContent("Belum");
  });
});
