import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("turns italic on from the toolbar and says so", async () => {
    renderEditor();
    const italic = await screen.findByRole("button", { name: "Miring" });

    fireEvent.click(italic);

    await waitFor(() => expect(italic).toHaveAttribute("aria-pressed", "true"));
  });

  // Pressing a toolbar button must not take the selection out of the text, or the format would
  // land nowhere: the press is cancelled, the click still runs.
  it("keeps the selection in the text when a toolbar button is pressed", async () => {
    renderEditor();
    const bold = await screen.findByRole("button", { name: "Tebal" });

    expect(fireEvent.mouseDown(bold)).toBe(false);
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

// Selects the note's first paragraph as a drag would: through the browser's selection, which
// ProseMirror reads on selectionchange.
async function selectFirstParagraph() {
  const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
  await act(async () => {
    box.focus();
    document.getSelection()?.selectAllChildren(box.querySelector("p")!);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function addLink(address: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Tambah link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "URL link" }), {
    target: { value: address },
  });
  fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
}

const lastHtml = (onChange: ReturnType<typeof vi.fn>): string =>
  onChange.mock.lastCall?.[0].html ?? "";

describe("RichNoteEditor links", () => {
  it("opens a row for the address when Link is pressed, and closes it when pressed again", async () => {
    renderEditor();
    const link = await screen.findByRole("button", { name: "Tambah link" });

    fireEvent.click(link);
    expect(screen.getByRole("textbox", { name: "URL link" })).toHaveAttribute(
      "placeholder",
      "https://…",
    );
    expect(screen.getByRole("button", { name: "Terapkan" })).toBeInTheDocument();

    fireEvent.click(link);
    expect(screen.queryByRole("textbox", { name: "URL link" })).not.toBeInTheDocument();
  });

  // Positive: with nothing selected, the address itself goes in as the link.
  it("adds the address as a link when nothing is selected, then closes the row", async () => {
    const { onChange } = renderEditor();

    await addLink("https://drive.google.com/file/d/abc");

    await waitFor(() =>
      expect(lastHtml(onChange)).toContain('href="https://drive.google.com/file/d/abc"'),
    );
    expect(onChange.mock.lastCall?.[0].text).toContain("https://drive.google.com/file/d/abc");
    expect(screen.queryByRole("textbox", { name: "URL link" })).not.toBeInTheDocument();
  });

  // Positive: selected words become the link's text.
  it("links the selected words", async () => {
    const { onChange } = renderEditor({ initialContent: "<p>Intro</p>" });
    await selectFirstParagraph();

    await addLink("https://drive.google.com/file/d/abc");

    await waitFor(() =>
      expect(lastHtml(onChange)).toMatch(
        /href="https:\/\/drive\.google\.com\/file\/d\/abc"[^>]*>Intro<\/a>/,
      ),
    );
  });

  // Negative (OWASP A05): only http and https; a javascript: link would run a script on a click.
  it.each([
    ["a javascript: link", "javascript:alert(1)"],
    ["an ftp: link", "ftp://files.example/x"],
    ["an address without its scheme", "drive.google.com/x"],
    ["a scheme with nothing after it", "https://"],
    ["an address with a space inside", "https://drive google.com"],
  ])("refuses %s and keeps the row open", async (_what, address) => {
    const { onChange } = renderEditor();

    await addLink(address);

    expect(screen.getByRole("alert")).toHaveTextContent("Link harus diawali http:// atau https://");
    expect(onChange.mock.calls.some(([note]) => note.html.includes("<a"))).toBe(false);
    expect(screen.getByRole("textbox", { name: "URL link" })).toBeInTheDocument();
  });

  // Corner: the refusal steps back after 3.5 seconds, as the prototype's does, and not before.
  it("hides the refusal after 3.5 seconds, not a moment sooner", async () => {
    renderEditor();
    const link = await screen.findByRole("button", { name: "Tambah link" });
    // Only now: the queries that wait run on real time, so the clock is faked once they are done.
    vi.useFakeTimers();
    try {
      fireEvent.click(link);
      fireEvent.change(screen.getByRole("textbox", { name: "URL link" }), {
        target: { value: "javascript:alert(1)" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));

      act(() => vi.advanceTimersByTime(3499));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Link harus diawali http:// atau https://",
      );

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the selection in the text when Link is pressed", async () => {
    renderEditor();

    expect(
      fireEvent.mouseDown(await screen.findByRole("button", { name: "Tambah link" })),
    ).toBe(false);
  });

  // Corner: the scheme in capitals is still http(s), and spaces around the address are dropped.
  it("takes HTTPS in capitals and trims the spaces around the address", async () => {
    const { onChange } = renderEditor();

    await addLink("  HTTPS://Drive.Google.com/x  ");

    await waitFor(() =>
      expect(lastHtml(onChange)).toContain('href="HTTPS://Drive.Google.com/x"'),
    );
  });

  // OWASP A05, second layer: a javascript: link that arrives inside content never becomes a link.
  it("drops a javascript: link that comes in with the content, keeping its words", async () => {
    renderEditor({ initialContent: '<p><a href="javascript:alert(1)">klik</a></p>' });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(box).toHaveTextContent("klik");
    expect(box.querySelector("a")).toBeNull();
  });
});

// What a clipboard or a drag carries, as far as the editor reads it.
interface Carried {
  types: string[];
  files: File[];
  items: unknown[];
  getData: (type: string) => string;
}

// The clipboard a copy from a web page leaves: styled HTML beside the same words as plain text.
// A stub: it only answers what the editor asks for.
function clipboard(plain: string, html?: string): Carried {
  const types = html ? ["text/html", "text/plain"] : ["text/plain"];
  const data: Record<string, string> = { "text/plain": plain, "text/html": html ?? "" };
  return { types, files: [], items: [], getData: (type: string) => data[type] ?? "" };
}

async function paste(data: Carried) {
  const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
  act(() => box.focus());
  fireEvent.paste(box, { clipboardData: data });
}

describe("RichNoteEditor paste", () => {
  // AC 1 + OWASP A05: the words come in, the page's styling, links, images and scripts do not.
  it("keeps the words of a styled paste and drops everything else", async () => {
    const { onChange } = renderEditor();

    await paste(
      clipboard(
        "Judul\nHalo klik\ndunia",
        '<h1>Judul</h1><p style="color:red"><b>Halo</b> <a href="javascript:alert(1)">klik</a>' +
          '<img src="x" onerror="alert(1)"></p><p>dunia</p>',
      ),
    );

    await waitFor(() =>
      expect(lastHtml(onChange)).toBe("<p>Judul</p><p>Halo klik</p><p>dunia</p>"),
    );
  });

  // AC 1: each line of the paste stays its own line.
  it("keeps the line breaks of a plain paste", async () => {
    const { onChange } = renderEditor();

    await paste(clipboard("baris 1\nbaris 2"));

    await waitFor(() => expect(lastHtml(onChange)).toBe("<p>baris 1</p><p>baris 2</p>"));
  });

  // Corner: a copy from Windows ends its lines with \r\n.
  it("keeps Windows line breaks of a styled paste as lines too", async () => {
    const { onChange } = renderEditor();

    await paste(clipboard("baris 1\r\nbaris 2", "<p><b>baris 1</b></p><p>baris 2</p>"));

    await waitFor(() => expect(lastHtml(onChange)).toBe("<p>baris 1</p><p>baris 2</p>"));
  });

  // Corner: a blank line between two paragraphs of a copied page stays a blank line.
  it("keeps a blank line of a styled paste as an empty line", async () => {
    const { onChange } = renderEditor();

    await paste(clipboard("baris 1\n\nbaris 2", "<p><b>baris 1</b></p><p></p><p>baris 2</p>"));

    await waitFor(() =>
      expect(lastHtml(onChange)).toBe("<p>baris 1</p><p></p><p>baris 2</p>"),
    );
  });

  // Corner (Jira: stops at 1,000): a paste longer than the room left is cut, not refused.
  it.each([
    ["a styled paste", clipboard("a".repeat(1200), `<p><b>${"a".repeat(1200)}</b></p>`)],
    ["a plain paste", clipboard("a".repeat(1200))],
  ])("cuts %s at 1,000 characters", async (_what, data) => {
    const { onChange } = renderEditor();

    await paste(data);

    await waitFor(() => expect(onChange.mock.lastCall?.[0].length).toBe(1000));
  });
});

const shot = () => new File(["x"], "layar.png", { type: "image/png" });

// What a drag, a drop or a pasted screenshot carries: files, and no text. A stub.
function withFiles(files: File[], types = ["Files"]): Carried {
  return { files, types, items: [], getData: () => "" };
}

const frameOf = (box: HTMLElement) => box.closest("[data-dragging]") as HTMLElement;

// The focus may tidy the empty note into <p></p>; a pasted file itself adds nothing to it.
const noteStaysEmpty = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.every(([note]) => note.text === "" && !note.html.includes("<img"));

describe("RichNoteEditor screenshots", () => {
  // AC 3: a pasted screenshot goes to the list under the editor, never into the text.
  it("hands a pasted screenshot to the form, keeping it out of the text", async () => {
    const onFiles = vi.fn();
    const { onChange } = renderEditor({ onFiles });
    const file = shot();

    await paste(withFiles([file]));

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(noteStaysEmpty(onChange)).toBe(true);
  });

  // AC 3: a dropped screenshot goes the same way.
  it("hands a dropped screenshot to the form", async () => {
    const onFiles = vi.fn();
    renderEditor({ onFiles });
    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    const file = shot();

    fireEvent.drop(box, { dataTransfer: withFiles([file]) });

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  // The prototype's dashed outline while a file is over the editor.
  it("outlines the editor while a file is dragged over it", async () => {
    renderEditor({ onFiles: vi.fn() });
    const frame = frameOf(await screen.findByRole("textbox", { name: "Catatan revisi" }));
    expect(frame).toHaveAttribute("data-dragging", "false");

    fireEvent.dragEnter(frame, { dataTransfer: withFiles([shot()]) });
    expect(frame).toHaveAttribute("data-dragging", "true");

    fireEvent.dragLeave(frame, { dataTransfer: withFiles([shot()]) });
    expect(frame).toHaveAttribute("data-dragging", "false");
  });

  // Negative: dragging words is not a file, so no outline.
  it("does not outline the editor for dragged text", async () => {
    renderEditor({ onFiles: vi.fn() });
    const frame = frameOf(await screen.findByRole("textbox", { name: "Catatan revisi" }));

    fireEvent.dragEnter(frame, { dataTransfer: withFiles([], ["text/plain"]) });

    expect(frame).toHaveAttribute("data-dragging", "false");
  });

  // A file over the editor may be dropped there; words dragged over it are left to the text.
  it("lets a file be dropped on the editor, and leaves dragged words alone", async () => {
    renderEditor({ onFiles: vi.fn() });
    const frame = frameOf(await screen.findByRole("textbox", { name: "Catatan revisi" }));

    expect(fireEvent.dragOver(frame, { dataTransfer: withFiles([shot()]) })).toBe(false);
    expect(fireEvent.dragOver(frame, { dataTransfer: withFiles([], ["text/plain"]) })).toBe(true);
  });

  // Corner: moving onto the toolbar inside the editor is not leaving it.
  it("keeps the outline while the file moves onto the toolbar inside the editor", async () => {
    renderEditor({ onFiles: vi.fn() });
    const frame = frameOf(await screen.findByRole("textbox", { name: "Catatan revisi" }));
    fireEvent.dragEnter(frame, { dataTransfer: withFiles([shot()]) });

    // jsdom has no DragEvent, and its plain Event drops relatedTarget; a MouseEvent keeps it.
    fireEvent(
      frame,
      new MouseEvent("dragleave", {
        bubbles: true,
        relatedTarget: screen.getByRole("button", { name: "Tebal" }),
      }),
    );

    expect(frame).toHaveAttribute("data-dragging", "true");
  });

  // Negative: a drop or a paste that carries no files hands nothing to the form.
  it("hands nothing to the form when a drop or a paste carries no files", async () => {
    const onFiles = vi.fn();
    renderEditor({ onFiles });
    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });

    fireEvent.drop(box);
    fireEvent.paste(box);

    expect(onFiles).not.toHaveBeenCalled();
  });

  // Negative: an editor with no place for screenshots takes no files.
  it("takes no pasted file when the form has no place for screenshots", async () => {
    const { onChange } = renderEditor();

    await paste(withFiles([shot()]));

    expect(noteStaysEmpty(onChange)).toBe(true);
  });
});

describe("RichNoteEditor placeholder", () => {
  const PLACEHOLDER = "Jelaskan bagian yang perlu diubah.";

  // The prototype's hint, on the empty note and for screen readers too.
  it("shows its placeholder while the note is empty", async () => {
    renderEditor({ placeholder: PLACEHOLDER });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(box).toHaveAttribute("aria-placeholder", PLACEHOLDER);
    await waitFor(() =>
      expect(box.querySelector("[data-placeholder]")).toHaveAttribute(
        "data-placeholder",
        PLACEHOLDER,
      ),
    );
  });

  // Negative: once there are words, the hint is gone.
  it("drops the placeholder once the note has words", async () => {
    renderEditor({ placeholder: PLACEHOLDER, initialContent: "<p>Intro</p>" });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(box.querySelector("[data-placeholder]")).toBeNull();
  });
});

// What the form's textarea does today, so the editor can take its place in the Minta Revisi form
// without the form losing any of it.
describe("RichNoteEditor in a form", () => {
  it("takes the focus when it opens, as the form's note does", async () => {
    renderEditor({ autoFocus: true });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("says it is required and, when told, that it is invalid", async () => {
    renderEditor({ required: true, invalid: true });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(box).toHaveAttribute("aria-required", "true");
    expect(box).toHaveAttribute("aria-invalid", "true");
  });

  // Negative: a field that is neither says neither.
  it("says nothing of being required or invalid when it is not", async () => {
    renderEditor();

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    expect(box).not.toHaveAttribute("aria-required");
    expect(box).not.toHaveAttribute("aria-invalid");
  });

  // The form's "wajib diisi" message is read with the counter.
  it("names the form's message beside its counter", async () => {
    renderEditor({ describedBy: "pesan-wajib" });

    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
    const ids = box.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toContain("pesan-wajib");
    expect(ids).toHaveLength(2);
  });

  it("tells the form when the Admin leaves the note", async () => {
    const onBlur = vi.fn();
    renderEditor({ onBlur });
    const box = await screen.findByRole("textbox", { name: "Catatan revisi" });

    act(() => box.focus());
    fireEvent.blur(box);

    await waitFor(() => expect(onBlur).toHaveBeenCalled());
  });
});
