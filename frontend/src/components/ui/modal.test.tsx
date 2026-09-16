import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./modal";

function renderModal(onClose = vi.fn()) {
  render(
    <Modal title="Detail Creator" onClose={onClose}>
      <p>isi dialog</p>
    </Modal>,
  );
  return onClose;
}

describe("Modal", () => {
  it("announces itself as a dialog with its title", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Detail Creator" })).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const onClose = renderModal();

    await userEvent.click(screen.getByRole("button", { name: /tutup dialog/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape, which is where a keyboard user reaches first", async () => {
    const onClose = renderModal();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("ignores every other key", async () => {
    const onClose = renderModal();

    await userEvent.keyboard("{Enter}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = renderModal();

    await userEvent.click(screen.getByTestId("modal-backdrop"));

    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the click lands inside the dialog", async () => {
    const onClose = renderModal();

    await userEvent.click(screen.getByText("isi dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
