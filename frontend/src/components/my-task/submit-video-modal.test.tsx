import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { VideoLinksSaver, VideoLinksSaveResult } from "@/lib/video-links-api";
import {
  SubmitVideoModal,
  type SubmitVideoModalProps,
} from "./submit-video-modal";

// This mock follows the same contract as the real link saver (38.2's endpoints).
const mockSaveLinks = vi.fn<VideoLinksSaver>();

const defaultContent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Promo Lebaran",
  deadline: "2026-10-05",
};

const INSTAGRAM_REEL = "https://www.instagram.com/reel/C8abc12345/";
const OTHER_REEL = "https://www.instagram.com/p/DAbC123xyz/";
const TIKTOK_VIDEO = "https://www.tiktok.com/@tofly/video/7400000000000000000";
const YOUTUBE_LINK = "https://youtube.com/watch?v=dQw4w9WgXcQ";

const INSTAGRAM_ERROR = "Link harus dari Instagram (instagram.com/reel/… atau /p/…)";
const TAKEN = "Link ini sudah dipakai di konten lain";

function renderModal(overrides: Partial<SubmitVideoModalProps> = {}) {
  const props: SubmitVideoModalProps = {
    content: defaultContent,
    onClose: vi.fn(),
    onSubmitted: vi.fn(),
    saveLinksAction: mockSaveLinks,
    ...overrides,
  };
  render(<SubmitVideoModal {...props} />);
  return props;
}

const field = (name: "Instagram" | "TikTok") => screen.getByLabelText(`Link ${name}`);

function type(name: "Instagram" | "TikTok", value: string) {
  fireEvent.change(field(name), { target: { value } });
}

const sendButton = () => screen.getByRole("button", { name: "Kirim Link" });

/** Presses Kirim Link, then answers the confirmation with its confirm button. */
async function sendAndConfirm() {
  fireEvent.click(sendButton());
  const question = await screen.findByRole("alertdialog");
  fireEvent.click(within(question).getByRole("button", { name: "Ya, Kirim" }));
}

describe("SubmitVideoModal", () => {
  beforeEach(() => {
    mockSaveLinks.mockReset();
  });

  it("opens as Kirim Link Video with the content shown as read-only text", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Kirim Link Video" })).toBeInTheDocument();
    expect(screen.getByText("Promo Lebaran")).toBeInTheDocument();
    expect(screen.getByText("5 Okt 2026")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /nama konten/i })).toBeNull();
  });

  it("shows one link field per platform, Instagram first, when the creator has both", () => {
    renderModal();

    const fields = screen.getAllByRole("textbox");
    expect(fields.map((input) => input.getAttribute("aria-label"))).toEqual([
      "Link Instagram",
      "Link TikTok",
    ]);
  });

  it("shows only the platforms the creator has on file", () => {
    renderModal({ platforms: ["tiktok"] });

    expect(field("TikTok")).toBeInTheDocument();
    expect(screen.queryByLabelText("Link Instagram")).toBeNull();
  });

  it("explains that one link is enough, since no single field is required", () => {
    renderModal();

    expect(screen.getByText("Isi minimal satu link.")).toBeInTheDocument();
    expect(field("Instagram")).not.toBeRequired();
  });

  it("keeps Kirim Link disabled until one valid link is filled", () => {
    renderModal();
    expect(sendButton()).toBeDisabled();

    type("TikTok", TIKTOK_VIDEO);

    expect(sendButton()).toBeEnabled();
  });

  it("flags a wrong link in its own field as it is typed, leaving the other field clear", () => {
    renderModal();

    type("Instagram", YOUTUBE_LINK);

    expect(field("Instagram")).toHaveAttribute("aria-invalid", "true");
    expect(field("Instagram")).toHaveAccessibleDescription(INSTAGRAM_ERROR);
    expect(field("TikTok")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps Kirim Link disabled while one field is wrong, even with the other valid", () => {
    renderModal();

    type("TikTok", TIKTOK_VIDEO);
    type("Instagram", YOUTUBE_LINK);

    expect(sendButton()).toBeDisabled();
  });

  it("refuses a link longer than 300 characters", () => {
    renderModal();

    type("Instagram", `https://www.instagram.com/reel/${"a".repeat(300)}`);

    expect(field("Instagram")).toHaveAccessibleDescription("Link maksimal 300 karakter");
    expect(sendButton()).toBeDisabled();
  });

  it("asks for confirmation before sending, and sends nothing when the creator goes back", async () => {
    renderModal();
    type("TikTok", TIKTOK_VIDEO);

    fireEvent.click(sendButton());
    const question = await screen.findByRole("alertdialog", { name: "Kirim link video?" });
    expect(question).toHaveTextContent(
      "Konten akan berstatus Link Dikirim. Tanggal link pertama dipakai sebagai tanggal pengiriman.",
    );

    fireEvent.click(within(question).getByRole("button", { name: "Periksa Lagi" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mockSaveLinks).not.toHaveBeenCalled();
    expect(field("TikTok")).toHaveValue(TIKTOK_VIDEO);
  });

  it("sends every filled link, trimmed, for the selected content once confirmed", async () => {
    mockSaveLinks.mockResolvedValue({ ok: true });
    renderModal();
    type("Instagram", `  ${INSTAGRAM_REEL}  `);
    type("TikTok", TIKTOK_VIDEO);

    await sendAndConfirm();

    await waitFor(() => {
      expect(mockSaveLinks).toHaveBeenCalledWith(defaultContent.id, {
        added: [
          { platform: "instagram", url: INSTAGRAM_REEL },
          { platform: "tiktok", url: TIKTOK_VIDEO },
        ],
        replaced: [],
      });
    });
  });

  it("notifies the parent and closes after a successful save", async () => {
    mockSaveLinks.mockResolvedValue({ ok: true });
    const props = renderModal();
    type("TikTok", TIKTOK_VIDEO);

    await sendAndConfirm();

    await waitFor(() => {
      expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("locks the form while saving, so the links cannot be sent twice", async () => {
    let finish: (result: VideoLinksSaveResult) => void = () => undefined;
    mockSaveLinks.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const props = renderModal();
    type("TikTok", TIKTOK_VIDEO);

    await sendAndConfirm();

    const busy = await screen.findByRole("button", { name: "Mengirim..." });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
    expect(field("TikTok")).toBeDisabled();
    fireEvent.click(busy);
    expect(mockSaveLinks).toHaveBeenCalledTimes(1);

    // Neither the ✕ nor Escape can drop a save that is already on its way.
    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await act(async () => {
      finish({ ok: true });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a link already used on another content under its own field and stays open", async () => {
    mockSaveLinks.mockResolvedValue({
      ok: false,
      code: "VIDEO_LINK_TAKEN",
      message: TAKEN,
      errors: { tiktok: TAKEN },
    });
    const props = renderModal();
    type("Instagram", INSTAGRAM_REEL);
    type("TikTok", TIKTOK_VIDEO);

    await sendAndConfirm();

    await waitFor(() => {
      expect(field("TikTok")).toHaveAccessibleDescription(TAKEN);
    });
    expect(field("Instagram")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onSubmitted).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("drops the server's message from a field as soon as that field is edited", async () => {
    mockSaveLinks.mockResolvedValue({ ok: false, message: TAKEN, errors: { tiktok: TAKEN } });
    renderModal();
    type("TikTok", TIKTOK_VIDEO);
    await sendAndConfirm();
    await screen.findByText(TAKEN);

    type("TikTok", "https://vt.tiktok.com/ZSabc123/");

    expect(screen.queryByText(TAKEN)).toBeNull();
    expect(sendButton()).toBeEnabled();
  });

  it("announces a failure that names no field as an alert", async () => {
    mockSaveLinks.mockResolvedValue({ ok: false, message: "Link video gagal dikirim. Coba lagi." });
    renderModal();
    type("TikTok", TIKTOK_VIDEO);

    await sendAndConfirm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Link video gagal dikirim. Coba lagi.",
    );
    expect(sendButton()).toBeEnabled();
  });

  it("asks to confirm on Enter in a field, as the button would, and not while it is disabled", async () => {
    renderModal();

    fireEvent.keyDown(field("TikTok"), { key: "Enter" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    type("TikTok", TIKTOK_VIDEO);
    fireEvent.keyDown(field("TikTok"), { key: "a" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.keyDown(field("TikTok"), { key: "Enter" });
    expect(await screen.findByRole("alertdialog", { name: "Kirim link video?" })).toBeInTheDocument();
  });

  it("closes at once when nothing was typed", () => {
    const untouched = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(untouched.onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a typed link", () => {
    const props = renderModal();
    type("TikTok", TIKTOK_VIDEO);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(
      screen.getByRole("alertdialog", { name: "Batalkan pengiriman link video?" }),
    ).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  describe("when part of a save went through", () => {
    const partial: VideoLinksSaveResult = {
      ok: false,
      message: "Invoice terkunci",
      saved: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
    };

    it("treats the saved link as sent, so trying again never adds it twice", async () => {
      mockSaveLinks.mockResolvedValueOnce(partial).mockResolvedValueOnce({ ok: true });
      const onPartlySaved = vi.fn();
      renderModal({ links: [{ platform: "instagram", url: INSTAGRAM_REEL }], onPartlySaved });
      type("Instagram", OTHER_REEL);
      type("TikTok", TIKTOK_VIDEO);

      await sendAndConfirm();
      await screen.findByRole("alert");
      expect(onPartlySaved).toHaveBeenCalledTimes(1);

      await sendAndConfirm();

      await waitFor(() => {
        expect(mockSaveLinks).toHaveBeenLastCalledWith(defaultContent.id, {
          added: [],
          replaced: [{ platform: "instagram", url: OTHER_REEL }],
        });
      });
    });

    it("no longer reads as a first submit once a link is saved", async () => {
      mockSaveLinks.mockResolvedValueOnce(partial);
      renderModal();
      type("Instagram", INSTAGRAM_REEL);
      type("TikTok", TIKTOK_VIDEO);

      await sendAndConfirm();
      await screen.findByRole("alert");
      fireEvent.click(sendButton());

      expect(await screen.findByRole("alertdialog", { name: "Simpan link video?" })).toBeInTheDocument();
    });

    it("works without a parent listening for it", async () => {
      mockSaveLinks.mockResolvedValueOnce(partial);
      renderModal();
      type("TikTok", TIKTOK_VIDEO);

      await sendAndConfirm();

      expect(await screen.findByRole("alert")).toHaveTextContent("Invoice terkunci");
    });
  });

  describe("adding a link for another platform later", () => {
    const sent = [{ platform: "instagram" as const, url: INSTAGRAM_REEL }];

    it("opens with the link already sent filled in and the other field empty", () => {
      renderModal({ links: sent });

      expect(field("Instagram")).toHaveValue(INSTAGRAM_REEL);
      expect(field("TikTok")).toHaveValue("");
    });

    it("stays disabled until something changes from what was sent", () => {
      renderModal({ links: sent });

      expect(sendButton()).toBeDisabled();
    });

    it("sends only the new platform's link and says the first date stays", async () => {
      mockSaveLinks.mockResolvedValue({ ok: true });
      renderModal({ links: sent });
      type("TikTok", TIKTOK_VIDEO);

      fireEvent.click(sendButton());
      expect(await screen.findByRole("alertdialog", { name: "Simpan link video?" })).toHaveTextContent(
        "Link TikTok ditambahkan. Tanggal pengiriman konten tidak berubah.",
      );
      fireEvent.click(screen.getByRole("button", { name: "Ya, Kirim" }));

      await waitFor(() => {
        expect(mockSaveLinks).toHaveBeenCalledWith(defaultContent.id, {
          added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
          replaced: [],
        });
      });
    });

    it("shows a sent link's field even when its platform is no longer on file", () => {
      renderModal({ platforms: ["tiktok"], links: sent });

      expect(field("Instagram")).toHaveValue(INSTAGRAM_REEL);
    });
  });

  describe("replacing a sent link", () => {
    const sent = [{ platform: "instagram" as const, url: INSTAGRAM_REEL }];

    it("shows only the sent links when no platform may be added, as for an admin", () => {
      renderModal({ platforms: [], links: sent });

      expect(field("Instagram")).toHaveValue(INSTAGRAM_REEL);
      expect(screen.queryByLabelText("Link TikTok")).toBeNull();
      expect(screen.queryByText("Isi minimal satu link.")).toBeNull();
    });

    it("sends the changed link as a replacement and warns its numbers are cleared", async () => {
      mockSaveLinks.mockResolvedValue({ ok: true });
      renderModal({ links: sent });
      type("Instagram", OTHER_REEL);

      fireEvent.click(sendButton());
      expect(await screen.findByRole("alertdialog")).toHaveTextContent(
        "Link Instagram diganti. Angka performa link lama dihapus.",
      );
      fireEvent.click(screen.getByRole("button", { name: "Ya, Kirim" }));

      await waitFor(() => {
        expect(mockSaveLinks).toHaveBeenCalledWith(defaultContent.id, {
          added: [],
          replaced: [{ platform: "instagram", url: OTHER_REEL }],
        });
      });
    });

    it("refuses emptying a sent link, since a link can be replaced but not removed", () => {
      renderModal({ links: sent });

      type("Instagram", "");

      expect(field("Instagram")).toHaveAccessibleDescription(
        "Link yang sudah dikirim tidak bisa dikosongkan. Ganti dengan link baru.",
      );
      expect(sendButton()).toBeDisabled();
    });
  });
});
