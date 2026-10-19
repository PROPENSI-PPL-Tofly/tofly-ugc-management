import { fireEvent, render, screen } from "@testing-library/react";
import { formatTimestamp } from "@/lib/format";
import { type InvoiceRow } from "@/lib/invoice";
import { FinalizeModal } from "./finalize-modal";

const moves = vi.hoisted(() => ({
  finalizeInvoice: vi.fn(),
}));

vi.mock("@/lib/invoice-actions.server", () => moves);

const ROW: InvoiceRow = {
  creatorId: "0fcc2741-73b1-4df2-8d64-6c7363862499",
  creatorName: "Rangga Pratama",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractStatus: "expired",
  contractEnd: "2026-10-17",
  fixedAmount: 500000,
  extraAmount: 200000,
  bonusAmount: 150000,
  penaltyAmount: 150000,
  totalAmount: 700000,
  floored: false,
  dataWaiting: false,
  invoiceStatus: "accruing",
  adjustments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      amount: -75000,
      reason: "Koreksi kelebihan tagihan",
      createdAt: "2026-10-18T03:00:00.000Z",
    },
  ],
  frozenAt: null,
};

describe("FinalizeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moves.finalizeInvoice.mockResolvedValue({ ok: true });
  });

  it("shows the whole breakdown and the total before anything is frozen", () => {
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    expect(screen.getByText("Rp500.000")).toBeInTheDocument();
    expect(screen.getByText("Rp200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp150.000")).toBeInTheDocument();
    expect(screen.getByText("− Rp150.000")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent("Rp700.000");
    expect(screen.getByText("Koreksi kelebihan tagihan")).toBeInTheDocument();
    expect(screen.getByText("− Rp75.000")).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp("2026-10-18T03:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText(/dikunci dan tidak berubah lagi/)).toBeInTheDocument();
  });

  it("says the bonus is waiting rather than writing a zero", () => {
    render(
      <FinalizeModal
        row={{ ...ROW, bonusAmount: null, totalAmount: 550000 }}
        onCancel={vi.fn()}
        onFinalized={vi.fn()}
      />,
    );

    expect(screen.getByText("Menunggu data")).toBeInTheDocument();
  });

  it("freezes the invoice on confirm and hands it back to be read", async () => {
    const onFinalized = vi.fn();
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(moves.finalizeInvoice).toHaveBeenCalledWith(ROW.contractId),
    );
    await vi.waitFor(() => expect(onFinalized).toHaveBeenCalled());
  });

  it("keeps the confirmation open with the refusal when the server will not freeze", async () => {
    const onFinalized = vi.fn();
    moves.finalizeInvoice.mockResolvedValue({
      ok: false,
      code: "CONTRACT_NOT_ENDED",
      message: "Kontrak belum berakhir",
    });
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Kontrak belum berakhir"),
    );
    expect(onFinalized).not.toHaveBeenCalled();
  });

  it("says only that the request could not go through when it throws", async () => {
    moves.finalizeInvoice.mockRejectedValue(new Error("fetch failed"));
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Permintaan tidak dapat diproses. Coba lagi."),
    );
  });

  it("changes nothing on Batal", () => {
    const onCancel = vi.fn();
    render(<FinalizeModal row={ROW} onCancel={onCancel} onFinalized={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onCancel).toHaveBeenCalled();
    expect(moves.finalizeInvoice).not.toHaveBeenCalled();
  });
});
