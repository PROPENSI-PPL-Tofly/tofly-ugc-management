import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Modal } from "./modal";

/** A trigger plus the dialog, so focus has somewhere real to come from and return to. */
function Harness({ open, onClose = () => {} }: { open: boolean; onClose?: () => void }) {
  return (
    <>
      <button type="button">Buka detail</button>
      {open ? (
        <Modal
          title="Rangga Pratama"
          onClose={onClose}
          footer={
            <>
              <button type="button">Tutup</button>
              <button type="button">Lihat Content Plan</button>
            </>
          }
        >
          <p>isi dialog</p>
        </Modal>
      ) : null}
    </>
  );
}

describe("Modal", () => {
  it("names the dialog with its visible heading", () => {
    render(<Harness open />);
    const heading = screen.getByRole("heading", { name: "Rangga Pratama" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Rangga Pratama");
    expect(heading).toBeInTheDocument();
  });

  it("closes on Escape, on the close button, and on a backdrop click", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close when the press lands inside the dialog", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    fireEvent.mouseDown(screen.getByText("isi dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves the backdrop out of the accessibility tree", () => {
    render(<Harness open />);

    // Scenery, not a control: Escape and the close button are the keyboard exits.
    expect(screen.getByTestId("modal-backdrop")).not.toHaveAttribute("role");
  });

  it("moves focus into the dialog when it opens", () => {
    render(<Harness open />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("keeps Tab inside the dialog, wrapping at both ends", () => {
    render(<Harness open />);

    const close = screen.getByRole("button", { name: "Tutup dialog" });
    const last = screen.getByRole("button", { name: "Lihat Content Plan" });

    // From the container, Tab enters at the top and Shift+Tab enters at the bottom.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    // Past the last control, Tab wraps to the first instead of reaching the page.
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    // And back the other way.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("lets Tab move normally between controls inside the dialog", () => {
    render(<Harness open />);
    const first = screen.getByRole("button", { name: "Tutup" });
    first.focus();

    const tab = fireEvent.keyDown(document, { key: "Tab" });

    // Not prevented: the browser moves focus to the next control on its own.
    expect(tab).toBe(true);
    expect(first).toHaveFocus();
  });

  it("ignores keys other than Tab and Escape", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    expect(fireEvent.keyDown(document, { key: "a" })).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns focus to whatever opened it", () => {
    const { rerender } = render(<Harness open={false} />);

    const opener = screen.getByRole("button", { name: "Buka detail" });
    opener.focus();

    rerender(<Harness open />);
    expect(screen.getByRole("dialog")).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });

  it("renders without a footer", () => {
    render(
      <Modal title="Judul" onClose={() => {}}>
        <p>isi</p>
      </Modal>,
    );
    expect(screen.getByText("isi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tutup" })).toBeNull();
  });
});
