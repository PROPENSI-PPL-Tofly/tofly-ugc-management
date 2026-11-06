import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RichNoteEditor } from "./rich-note-editor";

function renderEditor(props: Partial<Parameters<typeof RichNoteEditor>[0]> = {}) {
  const onChange = vi.fn();
  render(<RichNoteEditor label="Catatan revisi" max={1000} onChange={onChange} {...props} />);
  return { onChange };
}

// jsdom does no layout, so ProseMirror's scroll after a toolbar click finds no rectangles to
// read; empty ones stand in for the browser's. Only this file, and put back afterwards.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterAll(() => {
  delete (Range.prototype as Partial<Range>).getClientRects;
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});

describe("RichNoteEditor", () => {
  // AC 1: the prototype's toolbar, in its order.
  it("offers bold, italic, bulleted list, numbered list and link, in the prototype's order", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Catatan revisi" });

    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Tebal", "Miring", "Daftar poin", "Daftar nomor", "Tambah link"]);
    expect(screen.getByRole("button", { name: "Daftar poin" })).toHaveTextContent("• Poin");
    expect(screen.getByRole("button", { name: "Daftar nomor" })).toHaveTextContent("1. Nomor");
  });

  it("turns bold on from the toolbar and says so", async () => {
    renderEditor();
    const bold = await screen.findByRole("button", { name: "Tebal" });
    expect(bold).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(bold);

    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "true"));
  });

  it.each([
    ["Daftar poin", "<ul>"],
    ["Daftar nomor", "<ol>"],
  ])("makes a list with %s", async (name, tag) => {
    const { onChange } = renderEditor({ initialContent: "<p>Intro</p>" });

    fireEvent.click(await screen.findByRole("button", { name }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tag) }),
      ),
    );
  });

  // AC 2: the counter counts the text, never the formatting.
  it("counts the text without its formatting", async () => {
    renderEditor({ initialContent: "<p><strong>Hook</strong> <em>lemah</em></p>" });

    expect(await screen.findByText("10/1000")).toBeInTheDocument();
  });

  // Corner: exactly at the limit, the counter says it is full.
  it("says the note is full at exactly 1,000 characters", async () => {
    renderEditor({ initialContent: `<p>${"a".repeat(1000)}</p>` });

    expect(await screen.findByText("1000/1000")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Maksimal 1000 karakter");
  });

  it("locks the toolbar and the text while the form is sending", async () => {
    renderEditor({ disabled: true });

    const textbox = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(textbox).toHaveAttribute("contenteditable", "false");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });
});
