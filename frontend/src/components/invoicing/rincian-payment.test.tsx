import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { InvoiceRow, InvoiceStatus } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import type { InvoicePayment } from "@/lib/invoice-payment-api";
import { uploadPaymentProof } from "@/lib/invoice-payment-actions.server";
import { useBreakdownPopups } from "./use-breakdown-popups";

// The Content Detail panel is tested where it lives; here it is never opened.
vi.mock("@/components/content-detail/content-detail-panel", () => ({
  ContentDetailPanel: () => null,
}));

// Every server action the Rincian panel reaches is stood in for, so nothing leaves the test.
vi.mock("@/lib/invoice-breakdown.server", () => ({ loadInvoiceBreakdown: vi.fn() }));
vi.mock("@/lib/invoice-actions.server", () => ({
  addInvoiceAdjustment: vi.fn(),
  finalizeInvoice: vi.fn(),
}));
vi.mock("@/lib/invoice-payment-actions.server", () => ({ uploadPaymentProof: vi.fn() }));
vi.mock("@/lib/invoice-comments-actions.server", () => ({
  loadInvoiceComments: vi.fn().mockResolvedValue({ ok: true, comments: [] }),
  addInvoiceComment: vi.fn(),
}));

const CONTRACT = "11111111-1111-4111-8111-111111111111";
const PROOF_HREF = `/api/invoices/${CONTRACT}/payment-proof`;

const ACKNOWLEDGED: InvoicePayment = {
  acknowledgedAt: "2026-10-20T02:15:00.000Z",
  receivedAt: null,
  proof: null,
};

const PAID: InvoicePayment = {
  acknowledgedAt: "2026-10-20T02:15:00.000Z",
  receivedAt: "2026-10-21T09:30:00.000Z",
  proof: { fileName: "bukti.pdf", href: PROOF_HREF, uploadedAt: "2026-10-20T08:00:00.000Z" },
};

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    period: { number: 1, start: "2026-07-01", end: "2026-09-30", quotaDone: 10, quotaTotal: 10 },
    total: 1000000,
    notStarted: false,
  },
  extra: { lines: [], total: 0 },
  bonus: { lines: [], total: 0, performance: "ready", rules: { tiers: [], specificBonus: 0 } },
  penalty: { lines: [], total: 0 },
};

function rowAt(invoiceStatus: InvoiceStatus, payment?: InvoicePayment): InvoiceRow {
  return {
    creatorId: "0fcc2741-73b1-4df2-8d64-6c7363862499",
    creatorName: "Rangga Pratama",
    contractId: CONTRACT,
    periodNumber: 1,
    contractStatus: "expired",
    contractEnd: "2026-09-30",
    fixedAmount: 1000000,
    extraAmount: 0,
    bonusAmount: 0,
    penaltyAmount: 0,
    totalAmount: 1000000,
    floored: false,
    dataWaiting: false,
    pendingBonus: null,
    invoiceStatus,
    adjustments: [],
    frozenAt: "2026-10-01T03:00:00.000Z",
    ...(payment && { payment }),
  };
}

function Harness({ row, onMutated }: Readonly<{ row: InvoiceRow; onMutated: () => void }>) {
  const { open, layers } = useBreakdownPopups({
    load: vi.fn().mockResolvedValue(BREAKDOWN),
    onMutated,
  });
  return (
    <>
      <button type="button" onClick={() => open("all", row)}>
        Rincian
      </button>
      {layers}
    </>
  );
}

async function openRincian(row: InvoiceRow, onMutated = vi.fn()) {
  render(<Harness row={row} onMutated={onMutated} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rincian" })));
  return onMutated;
}

describe("the payment part of the Rincian panel", () => {
  it("dates the acknowledgement on the tracker and offers the proof upload while acknowledged", async () => {
    await openRincian(rowAt("creator_acked", ACKNOWLEDGED));

    const steps = within(screen.getByRole("list", { name: "Progres invoice" })).getAllByRole("listitem");
    expect(steps[2]).toHaveTextContent("Di-ack Creator, selesai20 Okt 2026");
    expect(screen.getByLabelText("File bukti pembayaran")).toBeInTheDocument();
  });

  it("dates no step past Final for an invoice the API has not sent a payment for yet", async () => {
    await openRincian(rowAt("finalized"));

    const steps = within(screen.getByRole("list", { name: "Progres invoice" })).getAllByRole("listitem");
    expect(steps.slice(2).map((step) => step.textContent)).toEqual(["Di-ack Creator", "Bukti Bayar", "Paid"]);
  });

  it("keeps a Paid invoice read-only except for comments", async () => {
    await openRincian(rowAt("paid", PAID));

    expect(screen.queryByLabelText("File bukti pembayaran")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Tambah Penyesuaian" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Aktivitas & Komentar/ })));
    expect(screen.getByLabelText("Tulis komentar")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tulis komentar"), { target: { value: "Sudah diterima, terima kasih." } });
    expect(screen.getByRole("button", { name: "Kirim" })).toBeEnabled();
  });

  it("reads the table again after an upload and keeps the panel open on the uploaded file", async () => {
    vi.mocked(uploadPaymentProof).mockResolvedValue({ ok: true, proof: PAID.proof! });
    const onMutated = await openRincian(rowAt("creator_acked", ACKNOWLEDGED));

    fireEvent.change(screen.getByLabelText("File bukti pembayaran"), {
      target: { files: [new File(["%PDF-1.7"], "bukti.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload bukti" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kirim Bukti" })));

    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Rincian Invoice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "bukti.pdf" })).toHaveAttribute("href", PROOF_HREF);
    expect(screen.queryByLabelText("File bukti pembayaran")).not.toBeInTheDocument();
  });
});
