import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { useDiscardGuard } from "./use-discard-guard";

function Form({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: dirty,
    onDiscard,
    title: "Batalkan penambahan creator?",
  });
  return (
    <>
      <button type="button" onClick={requestClose}>
        Batal
      </button>
      {confirmDialog}
    </>
  );
}

describe("useDiscardGuard", () => {
  it("closes straight away when nothing has been typed", () => {
    const onDiscard = vi.fn();
    render(<Form dirty={false} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks first when the form holds unsaved input", () => {
    const onDiscard = vi.fn();
    render(<Form dirty onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onDiscard).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Batalkan penambahan creator?" }),
    ).toHaveTextContent("Data yang sudah diisi akan hilang.");
  });

  it("goes back to the form on Lanjut mengisi and discards on Buang", () => {
    const onDiscard = vi.fn();
    render(<Form dirty onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut mengisi" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
