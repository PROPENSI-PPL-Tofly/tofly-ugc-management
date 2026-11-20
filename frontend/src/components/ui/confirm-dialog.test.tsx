import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  function renderDialog() {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Batalkan penambahan creator?"
        message="Data yang sudah diisi akan hilang."
        confirmLabel="Buang"
        cancelLabel="Lanjut mengisi"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    return { onConfirm, onCancel };
  }

  // PBI-30 AC 3: renewing a contract ended for cause carries a warning above the facts.
  it("shows a warning beside the question only when it is given one", () => {
    const { rerender } = render(
      <ConfirmDialog
        title="Perpanjang kontrak?"
        message="Kontrak dan invoice periode sebelumnya tidak berubah."
        warning="Kontrak sebelumnya diakhiri lebih awal karena Fraud."
        confirmLabel="Perpanjang"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Kontrak sebelumnya diakhiri lebih awal karena Fraud.");

    rerender(
      <ConfirmDialog
        title="Perpanjang kontrak?"
        message="Kontrak dan invoice periode sebelumnya tidak berubah."
        confirmLabel="Perpanjang"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("diakhiri lebih awal");
  });

  it("asks its question as an alertdialog with the consequence spelled out", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "Batalkan penambahan creator?" });
    expect(dialog).toHaveTextContent("Data yang sudah diisi akan hilang.");
  });

  it("lists the facts it is given under the question, each with its label", () => {
    render(
      <ConfirmDialog
        title="Simpan Perubahan Konten?"
        message="Rangga langsung melihat perubahan ini di Tugas Saya."
        details={[
          ["Konten", "Promo Lebaran"],
          ["Deadline", "20 Nov 2026 → 25 Nov 2026"],
        ]}
        confirmLabel="Simpan"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    const values = screen.getAllByRole("definition").map((value) => value.textContent);
    expect(terms).toEqual(["Konten", "Deadline"]);
    expect(values).toEqual(["Promo Lebaran", "20 Nov 2026 → 25 Nov 2026"]);
  });

  it("puts focus on the safe choice so Enter never discards by accident", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Lanjut mengisi" })).toHaveFocus();
  });

  it("confirms only on the confirm button", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("treats the cancel button, Escape and the close button as keeping things as they are", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut mengisi" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
