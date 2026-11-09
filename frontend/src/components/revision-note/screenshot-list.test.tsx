import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ScreenshotUploader, StoredImage } from "@/lib/revision-note-uploads";
import { UploadRefused } from "@/lib/revision-note-images-api";
import { expectMinTarget, expectPhoneTarget } from "@/test/touch-target";
import { ScreenshotList } from "./screenshot-list";
import { useScreenshots } from "./use-screenshots";

interface UploadCall {
  file: File;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
  resolve: (stored: StoredImage) => void;
  reject: (error: unknown) => void;
}

// A mock uploader: it records each upload and lets the test answer it when it chooses.
function fakeUploader() {
  const calls: UploadCall[] = [];
  const upload = vi.fn<ScreenshotUploader["upload"]>(
    (file, { onProgress, signal }) =>
      new Promise((resolve, reject) => calls.push({ file, onProgress, signal, resolve, reject })),
  );
  // Deleting a stored image on the server; a mock, so a test checks which image it was asked for.
  const remove = vi.fn<ScreenshotUploader["remove"]>().mockResolvedValue(undefined);
  // Nothing left on the server from an earlier form, unless a test says otherwise.
  const list = vi.fn<ScreenshotUploader["list"]>().mockResolvedValue([]);
  return { uploader: { upload, remove, list }, upload, remove, list, calls };
}

const image = (name = "shot.png", type = "image/png") => new File(["x"], name, { type });

function Harness({
  uploader,
  disabled = false,
}: Readonly<{ uploader: ScreenshotUploader; disabled?: boolean }>) {
  return <ScreenshotList screenshots={useScreenshots(uploader)} disabled={disabled} />;
}

function pick(...files: File[]) {
  fireEvent.change(screen.getByLabelText("Pilih gambar revisi"), { target: { files } });
}

const addButton = () => screen.getByRole("button", { name: /Tambah Gambar/ });

describe("ScreenshotList", () => {
  it("offers Tambah Gambar with five left, for JPG, PNG and WebP", () => {
    render(<Harness uploader={fakeUploader().uploader} />);

    expect(addButton()).toHaveTextContent("5 sisa");
    expect(
      screen.getByText("Sisa 5 dari 5 gambar · JPG, PNG, WebP · maks. 5 MB"),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Pilih gambar revisi");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).toHaveAttribute("multiple");
  });

  it("opens the file picker from Tambah Gambar", () => {
    render(<Harness uploader={fakeUploader().uploader} />);
    const click = vi.spyOn(screen.getByLabelText("Pilih gambar revisi"), "click");

    fireEvent.click(addButton());

    expect(click).toHaveBeenCalled();
  });

  // Positive (AC 5): a picked image uploads with its progress, then shows as a thumbnail.
  it("uploads a picked image with its progress, then shows it", async () => {
    const { uploader, upload, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);

    pick(image("intro.png"));

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ name: "intro.png" }),
      expect.anything(),
    );
    expect(screen.getByText("Mengunggah 0%")).toBeInTheDocument();
    expect(
      screen.getByText("Mengunggah gambar… tombol kirim aktif lagi setelah selesai."),
    ).toBeInTheDocument();
    expect(addButton()).toHaveTextContent("4 sisa");

    act(() => calls[0].onProgress(40));
    expect(screen.getByRole("progressbar", { name: "intro.png" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );

    await act(async () => calls[0].resolve({ imageId: "img-1", url: "https://signed/1" }));
    expect(screen.getByRole("img", { name: "Lampiran" })).toHaveAttribute(
      "src",
      "https://signed/1",
    );
    expect(
      screen.getByText("Sisa 4 dari 5 gambar · JPG, PNG, WebP · maks. 5 MB"),
    ).toBeInTheDocument();
  });

  // AC 5: a failed upload says so and can be tried again.
  it("says Gagal diunggah when an upload fails, and Coba lagi uploads it again", async () => {
    const { uploader, upload, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image());

    await act(async () => calls[0].reject(new Error("network")));
    expect(screen.getByText("Gagal diunggah")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(upload).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Mengunggah 0%")).toBeInTheDocument();
  });

  // AC 5 + corner: × removes the image; an upload still running is cancelled, its late answer
  // ignored.
  it("removes an image with ×, cancelling its upload", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image("intro.png"));

    fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" }));

    expect(calls[0].signal.aborted).toBe(true);
    expect(screen.queryByText("intro.png")).not.toBeInTheDocument();
    await act(async () => calls[0].resolve({ imageId: "late", url: "https://signed/late" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // Negative (AC 4): a refused file gives its reason and is never uploaded.
  it("refuses a PDF with its reason and never uploads it", () => {
    const { uploader, upload } = fakeUploader();
    render(<Harness uploader={uploader} />);

    pick(image("brief.pdf", "application/pdf"));

    expect(screen.getByRole("alert")).toHaveTextContent("Format harus JPG, PNG, atau WebP");
    expect(upload).not.toHaveBeenCalled();
  });

  // Corner: the reason steps back to the help line after 3.5 seconds, as the prototype's does.
  it("puts the help line back 3.5 seconds after a refusal", () => {
    render(<Harness uploader={fakeUploader().uploader} />);
    const input = screen.getByLabelText("Pilih gambar revisi");
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { files: [image("brief.pdf", "application/pdf")] } });
      act(() => vi.advanceTimersByTime(3499));
      expect(screen.getByRole("alert")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByText("Sisa 5 dari 5 gambar · JPG, PNG, WebP · maks. 5 MB"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Corner: with five images, Tambah Gambar has none left.
  it("closes Tambah Gambar at five images", () => {
    render(<Harness uploader={fakeUploader().uploader} />);

    pick(...Array.from({ length: 5 }, (_, i) => image(`${i}.png`)));

    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveTextContent("0 sisa");
  });

  // Corner: with five images stored, the help line says how to make room.
  it("says to remove one once five images are stored", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(...Array.from({ length: 5 }, (_, i) => image(`${i}.png`)));

    await act(async () =>
      calls.forEach((call, i) =>
        call.resolve({ imageId: `img-${i}`, url: `https://signed/${i}` }),
      ),
    );

    expect(
      screen.getByText("Maksimal 5 gambar per catatan · hapus salah satu untuk menambah"),
    ).toBeInTheDocument();
  });

  // Negative: a picker that answers with no file list (cancelled) adds nothing.
  it("adds nothing when the picker answers with no files", () => {
    const { uploader, upload } = fakeUploader();
    render(<Harness uploader={uploader} />);

    fireEvent.change(screen.getByLabelText("Pilih gambar revisi"), { target: { files: null } });

    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("locks every control while the form is sending", async () => {
    const { uploader, calls } = fakeUploader();
    const { rerender } = render(<Harness uploader={uploader} />);
    pick(image());
    await act(async () => calls[0].reject(new Error("network")));

    rerender(<Harness uploader={uploader} disabled />);

    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });
});

describe("useScreenshots", () => {
  // What the revision form reads (AC 5): still uploading, and which images to send.
  it("tells the form while an image uploads, then which images to send", async () => {
    const { uploader, calls } = fakeUploader();
    const { result } = renderHook(() => useScreenshots(uploader));

    act(() => result.current.add([image("a.png"), image("b.png")]));
    expect(result.current.uploading).toBe(true);

    await act(async () => {
      calls[0].resolve({ imageId: "img-a", url: "x" });
      calls[1].reject(new Error("network"));
    });

    expect(result.current.uploading).toBe(false);
    expect(result.current.imageIds).toEqual(["img-a"]);
  });

  // Negative: only a failed upload is tried again; one still running is not sent twice.
  it("does not upload again an image that has not failed", () => {
    const { uploader, upload } = fakeUploader();
    const { result } = renderHook(() => useScreenshots(uploader));
    act(() => result.current.add([image()]));

    act(() => result.current.retry(result.current.uploads[0].id));

    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("ScreenshotList on a phone", () => {
  // WCAG 2.5.8 / 2.5.5, as the app's touch-target rules ask: × and Coba lagi are pressed with a
  // finger.
  it("makes × and Coba lagi big enough to press with a finger", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image());
    await act(async () => calls[0].reject(new Error("network")));

    for (const name of ["Hapus gambar", "Coba lagi"]) {
      const button = screen.getByRole("button", { name });
      expectMinTarget(button);
      expectPhoneTarget(button);
    }
  });
});

describe("removing a stored screenshot", () => {
  // AC 5 with 34.1: a stored image is deleted on the server, or it would still go out with the
  // note.
  it("deletes a stored image on the server, then takes it off the list", async () => {
    const { uploader, remove, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image("intro.png"));
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "https://signed/1" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" })));

    expect(remove).toHaveBeenCalledWith("img-1");
    expect(screen.queryByRole("img", { name: "Lampiran" })).not.toBeInTheDocument();
    expect(addButton()).toHaveTextContent("5 sisa");
  });

  // Negative: an image still uploading is not stored yet, so there is nothing to delete.
  it("does not ask the server to delete an image that is still uploading", () => {
    const { uploader, remove } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image());

    fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" }));

    expect(remove).not.toHaveBeenCalled();
  });

  // Corner: when the server cannot delete it, the image stays, with the reason.
  it("keeps the image and says so when the server cannot delete it", async () => {
    const { uploader, remove, calls } = fakeUploader();
    remove.mockRejectedValueOnce(new Error("network"));
    render(<Harness uploader={uploader} />);
    pick(image());
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "https://signed/1" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" })));

    expect(screen.getByRole("img", { name: "Lampiran" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Gambar gagal dihapus. Coba lagi.");
  });
});

describe("several files refused at once", () => {
  // AC 4: each refused file shows its own reason, so the admin can tell which one to fix.
  it("names each refused file with its own reason when several are picked together", () => {
    const { uploader } = fakeUploader();
    render(<Harness uploader={uploader} />);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "besar.png", { type: "image/png" });

    pick(image("brief.pdf", "application/pdf"), big, image("ok.png"));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("brief.pdf: Format harus JPG, PNG, atau WebP");
    expect(alert).toHaveTextContent("besar.png: Ukuran maksimal 5 MB");
  });

  it("says a reason already shown only once", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);

    pick(image("palsu.png"));
    await act(async () => calls[0].reject(new UploadRefused("Format harus JPG, PNG, atau WebP")));
    pick(image("palsu.png"));
    await act(async () => calls[1].reject(new UploadRefused("Format harus JPG, PNG, atau WebP")));

    expect(screen.getByRole("alert").textContent).toBe("palsu.png: Format harus JPG, PNG, atau WebP");
  });

  it("keeps the editor's refusals when the server turns one more file down", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);

    pick(image("brief.pdf", "application/pdf"), image("palsu.png"));
    await act(async () => calls[0].reject(new UploadRefused("Format harus JPG, PNG, atau WebP")));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("brief.pdf: Format harus JPG, PNG, atau WebP");
    expect(alert).toHaveTextContent("palsu.png: Format harus JPG, PNG, atau WebP");
  });
});

describe("a screenshot 34.1 turns down", () => {
  // AC 4, as the prototype shows a refusal: the file leaves the list and its reason takes the
  // help line, as the editor's own refusals do. "Gagal diunggah" and "Coba lagi" stay for an
  // upload that broke, the only one a retry can fix.
  it("drops the refused file and shows the server's reason on the help line", async () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image("ketujuh.png"));

    await act(async () => calls[0].reject(new UploadRefused("Maksimal 5 gambar per catatan")));

    expect(screen.getByRole("alert")).toHaveTextContent("Maksimal 5 gambar per catatan");
    expect(screen.queryByText("ketujuh.png")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
    expect(addButton()).toHaveTextContent("5 sisa");
  });
});

describe("images a closed form left behind", () => {
  const kept = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      imageId: `img-${i}`,
      url: `/api/revision-note-images/img-${i}`,
    }));

  // Review on #188: the images still on the server come back when the field opens, so the
  // five on screen are the five the server counts (AC 3).
  it("shows them again when the field opens, counted toward the five", async () => {
    const { uploader, list } = fakeUploader();
    list.mockResolvedValueOnce(kept(3));
    render(<Harness uploader={uploader} />);

    expect(await screen.findAllByRole("img", { name: "Lampiran" })).toHaveLength(3);
    expect(screen.getByText("Sisa 2 dari 5 gambar · JPG, PNG, WebP · maks. 5 MB")).toBeInTheDocument();
    expect(addButton()).toHaveTextContent("2 sisa");
  });

  // Corner: five left behind close Tambah Gambar until one is removed.
  it("closes Tambah Gambar when five are left behind", async () => {
    const { uploader, list } = fakeUploader();
    list.mockResolvedValueOnce(kept(5));
    render(<Harness uploader={uploader} />);

    await screen.findAllByRole("img", { name: "Lampiran" });
    expect(addButton()).toBeDisabled();
  });

  // AC 5: one left behind is removed from the server like any stored image.
  it("removes one left behind from the server with ×", async () => {
    const { uploader, list, remove } = fakeUploader();
    list.mockResolvedValueOnce(kept(1));
    render(<Harness uploader={uploader} />);
    await screen.findByRole("img", { name: "Lampiran" });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" })));

    expect(remove).toHaveBeenCalledWith("img-0");
  });

  // Negative: when the list cannot be read, the field still works from an empty list.
  it("starts empty and quiet when the server's list cannot be read", async () => {
    const { uploader, list } = fakeUploader();
    list.mockRejectedValueOnce(new Error("network"));
    render(<Harness uploader={uploader} />);

    await act(async () => {});
    expect(screen.getByText("Sisa 5 dari 5 gambar · JPG, PNG, WebP · maks. 5 MB")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("removing a stored screenshot twice", () => {
  // Review on #188: a second press while the first delete runs would send another DELETE, which
  // 34.1 answers 404, and say "Gambar gagal dihapus" for an image that is gone.
  it("sends one delete only, and holds × until the server answers", async () => {
    const { uploader, remove, calls } = fakeUploader();
    let answer: () => void = () => undefined;
    remove.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    render(<Harness uploader={uploader} />);
    pick(image());
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "/api/revision-note-images/img-1" }));
    const cross = screen.getByRole("button", { name: "Hapus gambar" });

    fireEvent.click(cross);
    fireEvent.click(cross);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(cross).toBeDisabled();
    await act(async () => answer());
    expect(screen.queryByRole("img", { name: "Lampiran" })).not.toBeInTheDocument();
  });

  // Negative: when the server keeps it, × can be pressed again.
  it("lets × be pressed again once the server keeps the image", async () => {
    const { uploader, remove, calls } = fakeUploader();
    remove.mockRejectedValueOnce(new Error("network"));
    render(<Harness uploader={uploader} />);
    pick(image());
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "/api/revision-note-images/img-1" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus gambar" })));

    expect(screen.getByRole("button", { name: "Hapus gambar" })).toBeEnabled();
  });
});

describe("useScreenshots remove twice", () => {
  // A form calling the hook twice in the same moment, before React draws again, still sends one
  // delete only.
  it("sends one delete when remove is called twice in a row", async () => {
    const { uploader, remove, calls } = fakeUploader();
    const { result } = renderHook(() => useScreenshots(uploader));
    act(() => result.current.add([image()]));
    await act(async () => calls[0].resolve({ imageId: "img-1", url: "/api/revision-note-images/img-1" }));
    const id = result.current.uploads[0].id;

    await act(async () => {
      result.current.remove(id);
      result.current.remove(id);
    });

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("a progress that repeats itself", () => {
  it("keeps showing the same percent when the same progress comes twice", () => {
    const { uploader, calls } = fakeUploader();
    render(<Harness uploader={uploader} />);
    pick(image());

    act(() => calls[0].onProgress(40));
    act(() => calls[0].onProgress(40));

    expect(screen.getByText("Mengunggah 40%")).toBeInTheDocument();
  });
});
