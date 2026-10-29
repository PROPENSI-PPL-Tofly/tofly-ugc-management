import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acknowledgeInvoice, confirmInvoicePayment } from "@/lib/creator-invoice-actions.server";
import { InvoiceMove } from "./invoice-move";

// The moves are server actions; here each answers what a test says.
vi.mock("@/lib/creator-invoice-actions.server", () => ({
  acknowledgeInvoice: vi.fn(),
  confirmInvoicePayment: vi.fn(),
}));

const CONTRACT = "5a5a5a5a-0000-4000-8000-000000000003";

function renderMove(action: "acknowledge" | "confirm") {
  const onDone = vi.fn();
  render(<InvoiceMove action={action} contractId={CONTRACT} onDone={onDone} />);
  return { onDone };
}

describe("InvoiceMove", () => {
  beforeEach(() => {
    vi.mocked(acknowledgeInvoice).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(confirmInvoicePayment).mockReset().mockResolvedValue({ ok: true });
  });

  it.each([
    ["acknowledge", "Acknowledge Invoice"],
    ["confirm", "Konfirmasi Diterima"],
  ] as const)("names the %s move as the prototype does", (action, label) => {
    renderMove(action);

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("asks first, since an acknowledgement cannot be taken back, and sends nothing until confirmed", () => {
    renderMove("acknowledge");

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge Invoice" }));

    const dialog = screen.getByRole("alertdialog", { name: "Acknowledge Invoice Ini?" });
    expect(dialog).toHaveTextContent("Rincian tidak bisa diubah lagi setelah ini. Admin lalu mengirim bukti bayar.");
    expect(acknowledgeInvoice).not.toHaveBeenCalled();
  });

  it("asks before a payment is confirmed, saying it becomes Paid for good", () => {
    renderMove("confirm");

    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Diterima" }));

    expect(screen.getByRole("alertdialog", { name: "Konfirmasi Pembayaran Diterima?" })).toHaveTextContent(
      "Status jadi Paid dan tidak bisa dibatalkan.",
    );
  });

  it("does nothing when the creator backs out", () => {
    const { onDone } = renderMove("acknowledge");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge Invoice" }));

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(acknowledgeInvoice).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("acknowledges the invoice on confirm, closes and reports it done", async () => {
    const { onDone } = renderMove("acknowledge");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge Invoice" }));

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Invoice sudah di-acknowledge."));
    expect(acknowledgeInvoice).toHaveBeenCalledWith(CONTRACT);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirms the payment on confirm", async () => {
    const { onDone } = renderMove("confirm");
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Diterima" }));

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Konfirmasi" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Pembayaran dikonfirmasi diterima."));
    expect(confirmInvoicePayment).toHaveBeenCalledWith(CONTRACT);
  });

  it("holds both buttons while the move is on its way, so it cannot be sent twice", async () => {
    let answer: (value: { ok: true }) => void = () => {};
    vi.mocked(acknowledgeInvoice).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderMove("acknowledge");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge Invoice" }));
    const dialog = screen.getByRole("alertdialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Acknowledge" }));

    expect(within(dialog).getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Batal" })).toBeDisabled();
    answer({ ok: true });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the question open with the refusal when the move is refused", async () => {
    vi.mocked(acknowledgeInvoice).mockResolvedValue({
      ok: false,
      code: "INVALID_INVOICE_TRANSITION",
      message: "Status invoice sudah berubah. Muat ulang halaman untuk melihat status terbaru.",
    });
    const { onDone } = renderMove("acknowledge");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge Invoice" }));

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Acknowledge" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Status invoice sudah berubah.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("says try again when the move itself fails, rather than leaving the creator guessing", async () => {
    vi.mocked(confirmInvoicePayment).mockRejectedValue(new Error("network"));
    renderMove("confirm");
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Diterima" }));

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Konfirmasi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Permintaan tidak dapat diproses. Coba lagi.");
  });
});
