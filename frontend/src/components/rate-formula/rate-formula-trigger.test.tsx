import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RateFormulaView } from "@/lib/rate-formula";
import { SAVED_FORMULA, UNCONFIGURED_FORMULA } from "@/lib/rate-formula.fixture";
import type { SaveRateFormulaResult } from "@/lib/rate-formula-api";
import { RateFormulaTrigger } from "./rate-formula-trigger";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchRateFormula = vi.fn<() => Promise<RateFormulaView>>();
const saveRateFormula = vi.fn<(...args: unknown[]) => Promise<SaveRateFormulaResult>>();
vi.mock("@/lib/rate-formula-api", () => ({
  fetchRateFormula: () => fetchRateFormula(),
  saveRateFormula: (...args: unknown[]) => saveRateFormula(...args),
}));

async function openModal() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /atur formula rate/i }));
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
  });
}

describe("RateFormulaTrigger", () => {
  beforeEach(() => {
    fetchRateFormula.mockReset();
    saveRateFormula.mockReset();
    refresh.mockReset();
    fetchRateFormula.mockResolvedValue(SAVED_FORMULA);
  });

  it("offers the button and no dialog until it is pressed", () => {
    render(<RateFormulaTrigger />);

    expect(screen.getByRole("button", { name: "Atur Formula Rate" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchRateFormula).not.toHaveBeenCalled();
  });

  it("reads the saved formula when pressed and opens the dialog filled with it", async () => {
    render(<RateFormulaTrigger />);

    await openModal();

    expect(fetchRateFormula).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Atur Formula Rate" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("100000");
  });

  it("opens a blank form when no formula has been saved yet", async () => {
    fetchRateFormula.mockResolvedValue(UNCONFIGURED_FORMULA);
    render(<RateFormulaTrigger />);

    await openModal();

    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("");
  });

  it("disables the button while the formula is being read", async () => {
    let resolve: (view: RateFormulaView) => void = () => {};
    fetchRateFormula.mockReturnValue(new Promise((done) => (resolve = done)));
    render(<RateFormulaTrigger />);

    fireEvent.click(screen.getByRole("button", { name: /atur formula rate/i }));

    expect(screen.getByRole("button", { name: /atur formula rate/i })).toBeDisabled();
    await act(async () => resolve(SAVED_FORMULA));
    expect(screen.getByRole("button", { name: /atur formula rate/i })).toBeEnabled();
  });

  it("says so, and opens no form that could overwrite what is saved, when the read fails", async () => {
    fetchRateFormula.mockRejectedValue(new Error("HTTP 500"));
    render(<RateFormulaTrigger />);

    await openModal();

    expect(screen.getByRole("alert")).toHaveTextContent("Formula rate tidak bisa dimuat. Coba lagi.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("drops the failure message on the next try", async () => {
    fetchRateFormula.mockRejectedValueOnce(new Error("HTTP 500"));
    render(<RateFormulaTrigger />);
    await openModal();

    await openModal();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("saves the formula, closes the dialog and confirms with a toast", async () => {
    saveRateFormula.mockResolvedValue({ ok: true, formula: SAVED_FORMULA });
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(saveRateFormula).toHaveBeenCalledWith(
      expect.objectContaining({ latePenaltyPerDay: 50000, specificBonus: 100000 }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Formula rate berhasil disimpan.");
  });

  // A saved formula recalculates every running invoice; the page reads them again at once, so the
  // table, the "no formula" notice and the period total never show the old formula's amounts.
  it("reads the invoices again once the formula is saved", async () => {
    saveRateFormula.mockResolvedValue({ ok: true, formula: SAVED_FORMULA });
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the page as it is when the save is refused", async () => {
    saveRateFormula.mockResolvedValue({ ok: false, message: "Formula rate tidak valid", errors: {} });
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the server's message under the rejected field", async () => {
    saveRateFormula.mockResolvedValue({
      ok: false,
      message: "Formula rate tidak valid",
      errors: { specificBonus: "Bonus Specific harus antara Rp0 dan Rp10.000.000" },
    });
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveAccessibleDescription(
      "Bonus Specific harus antara Rp0 dan Rp10.000.000",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a failure with no field messages as an alert in the dialog", async () => {
    saveRateFormula.mockResolvedValue({
      ok: false,
      message: "Formula rate gagal disimpan. Coba lagi.",
      errors: {},
    });
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(screen.getByRole("alert")).toHaveTextContent("Formula rate gagal disimpan. Coba lagi.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables Simpan while the save is in flight", async () => {
    saveRateFormula.mockReturnValue(new Promise(() => {}));
    render(<RateFormulaTrigger />);
    await openModal();

    await save();

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("opens clean again after a failed save is cancelled", async () => {
    saveRateFormula.mockResolvedValue({
      ok: false,
      message: "Formula rate gagal disimpan. Coba lagi.",
      errors: {},
    });
    render(<RateFormulaTrigger />);
    await openModal();
    await save();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    await openModal();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hands the number of running invoices to the dialog", async () => {
    render(<RateFormulaTrigger runningInvoices={7} />);

    await openModal();

    expect(screen.getByRole("note")).toHaveTextContent("7 invoice yang masih berjalan");
  });
});
