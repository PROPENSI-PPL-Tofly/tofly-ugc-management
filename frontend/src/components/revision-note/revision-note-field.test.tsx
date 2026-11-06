import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StoredImage } from "@/lib/revision-note-uploads";
import { RevisionNoteField, type RevisionNoteValue } from "./revision-note-field";
import type { ScreenshotUploader } from "./use-screenshots";

// jsdom does no layout; empty rects stand in for ProseMirror's scroll, as in rich-note-editor.test.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterAll(() => {
  delete (Range.prototype as Partial<Range>).getClientRects;
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});

// A mock uploader whose answers the test gives when it chooses.
function fakeUploader() {
  const calls: { signal: AbortSignal; resolve: (stored: StoredImage) => void }[] = [];
  const upload = vi.fn<ScreenshotUploader["upload"]>(
    (_file, { signal }) => new Promise((resolve) => calls.push({ signal, resolve })),
  );
  return { uploader: { upload }, upload, calls };
}

function renderField(uploader: ScreenshotUploader, disabled = false) {
  const onChange = vi.fn<(value: RevisionNoteValue) => void>();
  const view = render(
    <RevisionNoteField
      label="Catatan revisi"
      max={1000}
      uploader={uploader}
      disabled={disabled}
      onChange={onChange}
    />,
  );
  return { ...view, onChange, last: () => onChange.mock.lastCall?.[0] };
}

const shot = () => new File(["x"], "layar.png", { type: "image/png" });

async function pasteInto(data: { files: File[]; types: string[]; plain?: string }) {
  const box = await screen.findByRole("textbox", { name: "Catatan revisi" });
  act(() => box.focus());
  fireEvent.paste(box, {
    clipboardData: {
      files: data.files,
      types: data.types,
      items: [],
      getData: (type: string) => (type === "text/plain" ? (data.plain ?? "") : ""),
    },
  });
}

describe("RevisionNoteField", () => {
  it("puts the editor and Tambah Gambar together", async () => {
    renderField(fakeUploader().uploader);

    expect(await screen.findByRole("textbox", { name: "Catatan revisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tambah Gambar/ })).toBeInTheDocument();
  });

  // AC 3 + 5: a screenshot pasted into the text joins the list and holds Kirim Revisi back.
  it("uploads a screenshot pasted into the text, and says so to the form", async () => {
    const { uploader, upload } = fakeUploader();
    const { last } = renderField(uploader);

    await pasteInto({ files: [shot()], types: ["Files"] });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Mengunggah 0%")).toBeInTheDocument();
    await waitFor(() => expect(last()).toMatchObject({ uploading: true, imageIds: [] }));
  });

  it("tells the form which images to send once their upload is done", async () => {
    const { uploader, calls } = fakeUploader();
    const { last } = renderField(uploader);
    await pasteInto({ files: [shot()], types: ["Files"] });

    await act(async () => calls[0].resolve({ imageId: "img-1", url: "https://signed/1" }));

    await waitFor(() => expect(last()).toMatchObject({ uploading: false, imageIds: ["img-1"] }));
  });

  // AC 2: the form gets the note with its plain text and its length.
  it("tells the form the note, its text and its length", async () => {
    const { last } = renderField(fakeUploader().uploader);

    await pasteInto({ files: [], types: ["text/plain"], plain: "Hook lemah" });

    await waitFor(() =>
      expect(last()).toMatchObject({ html: "<p>Hook lemah</p>", text: "Hook lemah", length: 10 }),
    );
  });

  it("locks the text and the screenshots while the form is sending", async () => {
    renderField(fakeUploader().uploader, true);

    expect(await screen.findByRole("textbox", { name: "Catatan revisi" })).toHaveAttribute(
      "contenteditable",
      "false",
    );
    expect(screen.getByRole("button", { name: /Tambah Gambar/ })).toBeDisabled();
  });

  // Corner: closing the form mid-upload cancels the upload instead of leaving it running.
  it("cancels an upload still running when the form closes", async () => {
    const { uploader, calls } = fakeUploader();
    const { unmount } = renderField(uploader);
    await pasteInto({ files: [shot()], types: ["Files"] });

    unmount();

    expect(calls[0].signal.aborted).toBe(true);
  });
});
