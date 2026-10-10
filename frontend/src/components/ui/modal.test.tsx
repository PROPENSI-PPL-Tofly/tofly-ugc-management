import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

  // The browser moves focus on mousedown by default, after the dialog has already handed it
  // back to its opener, which would leave a keyboard user on the page body.
  it("keeps the browser from taking focus away from the opener on a press outside", () => {
    render(<Harness open />);

    const press = createEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    fireEvent(screen.getByTestId("modal-backdrop"), press);

    expect(press.defaultPrevented).toBe(true);
  });

  it("leaves a press inside the dialog to the browser, so its fields still take focus", () => {
    render(<Harness open />);

    const press = createEvent.mouseDown(screen.getByText("isi dialog"));
    fireEvent(screen.getByText("isi dialog"), press);

    expect(press.defaultPrevented).toBe(false);
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

  it("keeps focus where it is when the parent re-renders with a fresh onClose", () => {
    const { rerender } = render(
      <Modal title="Judul" onClose={() => {}}>
        <input aria-label="Nama" />
      </Modal>,
    );
    const input = screen.getByRole("textbox", { name: "Nama" });
    input.focus();

    rerender(
      <Modal title="Judul" onClose={() => {}}>
        <input aria-label="Nama" />
      </Modal>,
    );

    expect(input).toHaveFocus();
  });
});

describe("Modal stacked over another modal", () => {
  function Stacked({
    onOuterClose,
    onInnerClose,
  }: {
    onOuterClose: () => void;
    onInnerClose: () => void;
  }) {
    return (
      <Modal title="Luar" onClose={onOuterClose}>
        <p>isi luar</p>
        <Modal title="Dalam" onClose={onInnerClose} size="compact" role="alertdialog">
          <p>isi dalam</p>
        </Modal>
      </Modal>
    );
  }

  it("lets only the top dialog answer Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Stacked onOuterClose={outer} onInnerClose={inner} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("closes neither dialog when the press lands on the top one", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Stacked onOuterClose={outer} onInnerClose={inner} />);

    fireEvent.mouseDown(screen.getByText("isi dalam"));

    expect(outer).not.toHaveBeenCalled();
    expect(inner).not.toHaveBeenCalled();
  });

  it("closes only the top dialog on a press outside both", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Stacked onOuterClose={outer} onInnerClose={inner} />);

    fireEvent.mouseDown(document.body);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("hands Escape back to the dialog underneath once the top one is gone", () => {
    const outer = vi.fn();
    const { rerender } = render(
      <Modal title="Luar" onClose={outer}>
        <Modal title="Dalam" onClose={() => {}}>
          <p>isi dalam</p>
        </Modal>
      </Modal>,
    );

    rerender(
      <Modal title="Luar" onClose={outer}>
        <p>isi luar</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("announces a confirmation as an alertdialog", () => {
    render(<Stacked onOuterClose={() => {}} onInnerClose={() => {}} />);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Dalam");
  });
});

describe("Modal as a side sheet", () => {
  function renderSheet(props: Partial<Parameters<typeof Modal>[0]> = {}) {
    const onClose = vi.fn();
    render(
      <Modal title="Promo Lebaran" onClose={onClose} placement="side" {...props}>
        <p>isi panel</p>
      </Modal>,
    );
    return { onClose, dialog: screen.getByRole("dialog"), backdrop: screen.getByTestId("modal-backdrop") };
  }

  it("centres the dialog unless asked otherwise", () => {
    render(
      <Modal title="Promo Lebaran" onClose={() => {}}>
        <p>isi dialog</p>
      </Modal>,
    );

    expect(screen.getByTestId("modal-backdrop")).toHaveClass("items-center", "justify-center");
    expect(screen.getByRole("dialog")).toHaveClass("max-w-[640px]", "max-h-[88vh]");
    expect(screen.getByRole("dialog")).not.toHaveClass("h-full");
  });

  it("docks a side sheet to the right edge at full height", () => {
    const { dialog, backdrop } = renderSheet();

    expect(backdrop).toHaveClass("justify-end");
    expect(backdrop).not.toHaveClass("justify-center", "p-5");
    expect(dialog).toHaveClass("h-full", "max-w-[520px]");
    expect(dialog).not.toHaveClass("max-h-[88vh]");
  });

  it("keeps the sheet's own width whatever size is asked for", () => {
    const { dialog } = renderSheet({ size: "compact" });

    expect(dialog).toHaveClass("max-w-[520px]");
    expect(dialog).not.toHaveClass("max-w-[420px]");
  });

  it("closes a side sheet the same three ways as a centred dialog", () => {
    const { onClose, backdrop } = renderSheet();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.mouseDown(screen.getByText("isi panel"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows an eyebrow above the heading without making it part of the dialog's name", () => {
    const { dialog } = renderSheet({ eyebrow: "Rangga Pratama › Periode 2" });

    const eyebrow = screen.getByText("Rangga Pratama › Periode 2");
    const heading = screen.getByRole("heading", { name: "Promo Lebaran" });

    expect(eyebrow.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(dialog).toHaveAccessibleName("Promo Lebaran");
  });

  it("shows the meta line under the heading, inside the header", () => {
    renderSheet({ meta: <span>Deadline 12 Okt 2026</span> });

    const heading = screen.getByRole("heading", { name: "Promo Lebaran" });
    const meta = screen.getByText("Deadline 12 Okt 2026");

    expect(heading.compareDocumentPosition(meta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(meta.compareDocumentPosition(screen.getByText("isi panel"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("adds neither an eyebrow nor a meta line when none is given", () => {
    renderSheet();

    expect(screen.queryByTestId("modal-eyebrow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("modal-meta")).not.toBeInTheDocument();
  });

  it("keeps a side sheet's header in place and scrolls only its body", () => {
    const { dialog } = renderSheet();
    const body = screen.getByText("isi panel").parentElement;

    expect(dialog).toHaveClass("flex", "flex-col");
    expect(dialog).not.toHaveClass("overflow-y-auto");
    expect(body).toHaveClass("flex-1", "overflow-y-auto");
  });

  it("still scrolls a centred dialog as a whole", () => {
    render(
      <Modal title="Promo Lebaran" onClose={() => {}}>
        <p>isi dialog</p>
      </Modal>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("overflow-y-auto");
    expect(screen.getByText("isi dialog").parentElement).not.toHaveClass("overflow-y-auto");
  });

  it("lifts a side sheet off the page with a shadow, which a centred dialog does not need", () => {
    const { dialog } = renderSheet();

    expect(dialog).toHaveClass("shadow-sheet");
  });
});
