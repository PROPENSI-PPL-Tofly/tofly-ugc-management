import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScreenshotUploader, StoredImage } from "@/lib/revision-note-uploads";
import { FollowUpForm } from "./follow-up-form";

// PBI-33 AC 2: a follow-up is written in the same editor as the revision note (PBI-34), with
// the same formatting toolbar, rather than in a plain textarea.
describe("FollowUpForm with the revision note's editor", () => {
  it("opens into the rich text editor with its formatting toolbar", async () => {
    render(
      <FollowUpForm
        submissionId="22222222-2222-2222-2222-222222222222"
        add={vi.fn()}
        onAdded={vi.fn()}
        onRoundClosed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tambah Catatan Susulan" }));

    // Built after the first render, so the box is waited for before its tools are read.
    await screen.findByRole("textbox", { name: "Catatan susulan" });
    for (const tool of ["Tebal", "Miring", "Daftar poin", "Daftar nomor", "Tambah link"]) {
      expect(screen.getByRole("button", { name: tool })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Catatan susulan" })).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });
});

// A follow-up takes screenshots as the revision note does: pasted or picked, placed in the text,
// and sent with it by id.
describe("FollowUpForm with screenshots", () => {
  const SUBMISSION = "22222222-2222-2222-2222-222222222222";

  beforeAll(() => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  });

  afterAll(() => {
    delete (Range.prototype as Partial<Range>).getClientRects;
    delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  });

  function fakeUploader() {
    const calls: { resolve: (stored: StoredImage) => void }[] = [];
    const uploader: ScreenshotUploader = {
      upload: vi.fn(() => new Promise<StoredImage>((resolve) => calls.push({ resolve }))),
      remove: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    };
    return { uploader, calls };
  }

  async function openAndPaste(uploader: ScreenshotUploader, add = vi.fn().mockResolvedValue({})) {
    render(
      <FollowUpForm
        submissionId={SUBMISSION}
        add={add}
        uploader={uploader}
        onAdded={vi.fn()}
        onRoundClosed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tambah Catatan Susulan" }));
    const box = await screen.findByRole("textbox", { name: "Catatan susulan" });
    act(() => box.focus());
    fireEvent.paste(box, {
      clipboardData: { files: [new File(["x"], "layar.png", { type: "image/png" })], types: ["Files"], items: [], getData: () => "" },
    });
    return { box, add };
  }

  it("offers Tambah Gambar beside the formatting tools, as the revision note's editor does", async () => {
    render(
      <FollowUpForm
        submissionId={SUBMISSION}
        add={vi.fn()}
        uploader={fakeUploader().uploader}
        onAdded={vi.fn()}
        onRoundClosed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tambah Catatan Susulan" }));

    expect(await screen.findByRole("button", { name: /Tambah Gambar/ })).toBeInTheDocument();
  });

  it("holds Kirim Catatan Susulan back while a screenshot is still uploading", async () => {
    const { uploader } = fakeUploader();
    const { box } = await openAndPaste(uploader);
    fireEvent.paste(box, {
      clipboardData: { files: [], types: ["text/plain"], items: [], getData: () => "Lihat" },
    });

    expect(screen.getByRole("button", { name: "Kirim Catatan Susulan" })).toBeDisabled();
  });

  it("places the uploaded screenshot in the text and sends its id with the note", async () => {
    const { uploader, calls } = fakeUploader();
    const { box, add } = await openAndPaste(uploader);
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "/api/revision-note-images/img-1" }));
    await waitFor(() => expect(box.querySelector('img[data-image-id="img-1"]')).not.toBeNull());
    fireEvent.paste(box, {
      clipboardData: { files: [], types: ["text/plain"], items: [], getData: () => "Lihat" },
    });

    const send = screen.getByRole("button", { name: "Kirim Catatan Susulan" });
    await waitFor(() => expect(send).toBeEnabled());
    await act(async () => {
      fireEvent.click(send);
    });

    expect(add).toHaveBeenCalledTimes(1);
    const [id, html, imageIds] = add.mock.calls[0];
    expect(id).toBe(SUBMISSION);
    expect(html).toContain('<img data-image-id="img-1">');
    expect(imageIds).toEqual(["img-1"]);
  });
});
