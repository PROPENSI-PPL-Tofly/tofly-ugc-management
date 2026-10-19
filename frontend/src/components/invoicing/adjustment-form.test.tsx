import { fireEvent, render, screen } from "@testing-library/react";
import {
  AMOUNT_EMPTY,
  AMOUNT_INVALID,
  AMOUNT_THOUSANDS,
  REASON_EMPTY,
  REASON_MAX_LENGTH,
  REASON_TOO_LONG,
} from "@/lib/invoice-adjustment";
import { AdjustmentForm } from "./adjustment-form";

const moves = vi.hoisted(() => ({
  addInvoiceAdjustment: vi.fn(),
}));

vi.mock("@/lib/invoice-actions.server", () => moves);

const CONTRACT = "11111111-1111-4111-8111-111111111111";

function form(overrides: Partial<{ onClose: () => void; onMutated: () => void }> = {}) {
  return render(
    <AdjustmentForm
      contractId={CONTRACT}
      onClose={overrides.onClose ?? vi.fn()}
      onMutated={overrides.onMutated ?? vi.fn()}
    />,
  );
}

function fill(amount: string, reason: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Nominal (Rp)" }), {
    target: { value: amount },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Alasan" }), {
    target: { value: reason },
  });
}

describe("AdjustmentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moves.addInvoiceAdjustment.mockResolvedValue({ ok: true });
  });

  it("asks for an amount and a reason, and counts the reason", () => {
    form();

    expect(screen.getByRole("textbox", { name: "Nominal (Rp)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Alasan" })).toBeInTheDocument();
    expect(screen.getByText(/0\/500/)).toBeInTheDocument();
  });

  it("says below each field what was left empty, and sends nothing", () => {
    form();

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(screen.getByText(AMOUNT_EMPTY)).toBeInTheDocument();
    expect(screen.getByText(REASON_EMPTY)).toBeInTheDocument();
    expect(moves.addInvoiceAdjustment).not.toHaveBeenCalled();
  });

  it("says how to fix an amount typed with thousands dots", () => {
    form();
    fill("200.000", "Koreksi");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(screen.getByText(AMOUNT_THOUSANDS)).toBeInTheDocument();
    expect(moves.addInvoiceAdjustment).not.toHaveBeenCalled();
  });

  it("explains how to take away and how to add below the amount field", () => {
    form();

    expect(
      screen.getByText("Pakai tanda minus (-) untuk mengurangi invoice, angka biasa untuk menambah."),
    ).toBeInTheDocument();
  });

  it.each([
    ["200000", "Akan dicatat: +Rp200.000"],
    ["-100000", "Akan dicatat: − Rp100.000"],
  ])("shows what %s will be recorded as before it is sent", (amount, preview) => {
    form();
    fill(amount, "");

    expect(screen.getByText(preview)).toBeInTheDocument();
  });

  it("shows no amount preview for one it cannot read", () => {
    form();
    fill("abc", "");

    expect(screen.queryByText(/Akan dicatat/)).not.toBeInTheDocument();
  });

  it("says below the amount field what is wrong with it, in the backend's words", () => {
    form();
    fill("1.2345", "Koreksi");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(screen.getByText(AMOUNT_INVALID)).toBeInTheDocument();
    expect(moves.addInvoiceAdjustment).not.toHaveBeenCalled();
  });

  it("says below the reason field when it runs over the character counter", () => {
    form();
    fill("100000", "x".repeat(REASON_MAX_LENGTH + 1));

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(screen.getByText(REASON_TOO_LONG)).toBeInTheDocument();
    expect(moves.addInvoiceAdjustment).not.toHaveBeenCalled();
  });

  it("sends the amount and the trimmed reason, then hands the invoice back to be read", async () => {
    const onMutated = vi.fn();
    form({ onMutated });
    fill(" -100000.5 ", "  Koreksi  ");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() =>
      expect(moves.addInvoiceAdjustment).toHaveBeenCalledWith(CONTRACT, {
        amount: " -100000.5 ",
        reason: "  Koreksi  ",
      }),
    );
    await vi.waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it("shows a 422's field errors below their fields", async () => {
    moves.addInvoiceAdjustment.mockResolvedValue({
      ok: false,
      code: "INVALID",
      message: "Data penyesuaian tidak valid",
      fieldErrors: { amount: AMOUNT_INVALID },
    });
    form();
    fill("100000", "Koreksi");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() => expect(screen.getByText(AMOUNT_INVALID)).toBeInTheDocument());
  });

  it("keeps the form open with the refusal when the invoice will not take it", async () => {
    const onMutated = vi.fn();
    moves.addInvoiceAdjustment.mockResolvedValue({
      ok: false,
      code: "INVOICE_FINALIZED",
      message: "Invoice sudah difinalisasi",
    });
    form({ onMutated });
    fill("100000", "Koreksi");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invoice sudah difinalisasi"),
    );
    expect(onMutated).not.toHaveBeenCalled();
  });

  it("says only that the request could not go through when it throws", async () => {
    moves.addInvoiceAdjustment.mockRejectedValue(new Error("fetch failed"));
    form();
    fill("100000", "Koreksi");

    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Permintaan tidak dapat diproses. Coba lagi."),
    );
  });

  it("closes on Batal without asking for anything", () => {
    const onClose = vi.fn();
    form({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalled();
    expect(moves.addInvoiceAdjustment).not.toHaveBeenCalled();
  });
});
