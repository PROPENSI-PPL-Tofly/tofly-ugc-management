import { fireEvent, render, screen, within } from "@testing-library/react";
import { refusalMessage } from "@/lib/invoice-adjustment";
import { type InvoiceRow } from "@/lib/invoice";
import { InvoiceActions } from "./invoice-actions";

const moves = vi.hoisted(() => ({
  addInvoiceAdjustment: vi.fn(),
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
  penaltyAmount: 0,
  totalAmount: 700000,
  floored: false,
  dataWaiting: false,
  pendingBonus: null,
  invoiceStatus: "accruing",
  adjustments: [],
  frozenAt: null,
};

function actions(row: InvoiceRow, today = "2026-10-18") {
  const onMutated = vi.fn();
  render(<InvoiceActions row={row} today={today} onMutated={onMutated} />);
  return { onMutated };
}

describe("InvoiceActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moves.addInvoiceAdjustment.mockResolvedValue({ ok: true });
    moves.finalizeInvoice.mockResolvedValue({ ok: true });
  });

  it("offers both moves once the contract has ended and everything is measured", () => {
    actions(ROW);

    expect(screen.getByRole("button", { name: "+ Tambah Penyesuaian" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalize" })).toBeEnabled();
  });

  it("withholds freezing while the contract still runs, and says why", () => {
    actions({ ...ROW, contractStatus: "active", contractEnd: "2026-12-31" });

    expect(screen.queryByRole("button", { name: "Finalize" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Bisa difinalisasi setelah kontrak berakhir.",
    );
  });

  it("counts a contract that ended early as ended", () => {
    actions({ ...ROW, contractEnd: "2026-06-30" }, "2026-10-18");

    expect(screen.getByRole("button", { name: "Finalize" })).toBeEnabled();
  });

  it("holds the freeze button, with its reason, while a fee or penalty waits for a formula", () => {
    actions({ ...ROW, dataWaiting: true, extraAmount: 0 });

    const freeze = screen.getByRole("button", { name: "Finalize" });
    expect(freeze).toBeDisabled();
    expect(freeze).toHaveAttribute("title", refusalMessage("INVOICE_DATA_INCOMPLETE"));
    expect(screen.getByRole("status")).toHaveTextContent(
      refusalMessage("INVOICE_DATA_INCOMPLETE")!,
    );
  });

  // The bonus waits for performance data (PBI-19); the confirmation says what freezing it holds.
  it("offers the freeze while the bonus alone waits for data", () => {
    actions({
      ...ROW,
      bonusAmount: null,
      pendingBonus: { amount: 0, totalAmount: ROW.totalAmount, floored: false },
    });

    expect(screen.getByRole("button", { name: "Finalize" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers neither move once the invoice is frozen", () => {
    actions({ ...ROW, invoiceStatus: "finalized", frozenAt: "2026-10-18T03:00:00.000Z" });

    expect(screen.queryByRole("button", { name: "+ Tambah Penyesuaian" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens the adjustment form from the adjustment button", async () => {
    const { onMutated } = actions(ROW);

    fireEvent.click(screen.getByRole("button", { name: "+ Tambah Penyesuaian" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nominal (Rp)" }), {
      target: { value: "200000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Alasan" }), {
      target: { value: "Koreksi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() =>
      expect(moves.addInvoiceAdjustment).toHaveBeenCalledWith(ROW.contractId, {
        amount: "200000",
        reason: "Koreksi",
      }),
    );
    await vi.waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it("opens the finalize confirmation from the freeze button", async () => {
    const { onMutated } = actions(ROW);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("group", { name: "Total invoice" })).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(moves.finalizeInvoice).toHaveBeenCalledWith(ROW.contractId, { acceptPendingBonus: false }),
    );
    await vi.waitFor(() => expect(onMutated).toHaveBeenCalled());
  });
});
