import { act, fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceStatus } from "@/lib/invoice";
import type { InvoicePayment } from "@/lib/invoice-payment-api";
import type { CommentsGateway } from "./invoice-comments";
import { InvoicePaymentSection } from "./invoice-payment-section";

// The real upload and thread are server actions; the section must never reach them here.
vi.mock("@/lib/invoice-payment-actions.server", () => ({ uploadPaymentProof: vi.fn() }));
vi.mock("@/lib/invoice-comments-actions.server", () => ({
  loadInvoiceComments: vi.fn(),
  addInvoiceComment: vi.fn(),
}));

const CONTRACT = "11111111-1111-4111-8111-111111111111";

const ACKNOWLEDGED: InvoicePayment = {
  acknowledgedAt: "2026-10-20T02:15:00.000Z",
  receivedAt: null,
  proof: null,
};

function comments(): CommentsGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: true, comments: [] }),
    add: vi.fn(),
  };
}

async function renderSection(status: InvoiceStatus, payment: InvoicePayment = ACKNOWLEDGED) {
  await act(async () => {
    render(
      <InvoicePaymentSection
        contractId={CONTRACT}
        status={status}
        payment={payment}
        upload={vi.fn()}
        comments={comments()}
        onUploaded={vi.fn()}
      />,
    );
  });
}

describe("InvoicePaymentSection", () => {
  it("shows when the creator acknowledged the invoice and when they confirmed receipt", async () => {
    await renderSection("creator_acked");

    expect(screen.getByText("Diakui creator").nextElementSibling).toHaveTextContent(
      "20 Okt 2026, 09.15 WIB",
    );
    expect(screen.getByText("Penerimaan dikonfirmasi").nextElementSibling).toHaveTextContent("Belum");
  });

  it("offers the proof upload while the creator has acknowledged the invoice", async () => {
    await renderSection("creator_acked");

    expect(screen.getByLabelText("File bukti pembayaran")).toBeInTheDocument();
  });

  it("keeps a Paid invoice read-only except for comments: no upload, but a thread to add to", async () => {
    await renderSection("paid", {
      ...ACKNOWLEDGED,
      receivedAt: "2026-10-21T09:30:00.000Z",
      proof: { fileName: "bukti.pdf", href: `/api/invoices/${CONTRACT}/payment-proof`, uploadedAt: "2026-10-20T08:00:00.000Z" },
    });

    expect(screen.queryByLabelText("File bukti pembayaran")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tulis komentar")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tulis komentar"), { target: { value: "Sudah diterima, terima kasih." } });
    expect(screen.getByRole("button", { name: "Kirim" })).toBeEnabled();
  });

  it.each(["accruing", "finalized", "payment_uploaded"] as const)(
    "offers the comment thread while the invoice is %s too",
    async (status) => {
      await renderSection(status);

      expect(screen.getByLabelText("Tulis komentar")).toBeInTheDocument();
    },
  );
});
