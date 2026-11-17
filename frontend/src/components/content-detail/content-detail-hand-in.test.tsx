import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ContentDetailPanel } from "./content-detail-panel";
import type { ContentDetail } from "@/lib/content-detail";
import type { DraftSubmitter } from "@/lib/draft-submission";
import type { VideoLinksSaver } from "@/lib/video-links-api";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const CONTENT = "11111111-1111-1111-1111-111111111111";

function detail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: CONTENT,
    name: "Promo Lebaran",
    type: "specific",
    brief: "Tunjukkan fitur cashback.",
    deadline: "2099-12-31",
    status: "scheduled",
    creatorName: "Rangga Pratama",
    tags: [],
    waitingOn: "creator",
    latestSubmissionId: null,
    creatorActions: ["submit_draft"],
    links: [],
    events: [
      {
        id: `${CONTENT}:scheduled`,
        type: "scheduled",
        at: "2026-09-01T03:00:00.000Z",
        actor: { name: null, role: "admin" },
      },
    ],
    ...overrides,
  };
}

function open(loaded: ContentDetail) {
  const load = vi.fn().mockResolvedValue(loaded);
  const submitDraft = vi.fn<DraftSubmitter>().mockResolvedValue({
    ok: true,
    submission: {
      contentId: CONTENT,
      submissionId: "22222222-2222-2222-2222-222222222222",
      status: "draft_review",
      link: "https://drive.google.com/file/d/abc/view",
      notes: null,
      submittedAt: "2026-10-01T03:00:00.000Z",
    },
  });
  const saveLinks = vi.fn<VideoLinksSaver>().mockResolvedValue({ ok: true });
  const onClose = vi.fn();

  render(
    <ContentDetailPanel
      contentId={CONTENT}
      role="creator"
      onClose={onClose}
      load={load}
      handIn={{ submitDraft, saveLinks }}
    />,
  );

  return { load, submitDraft, saveLinks, onClose };
}

// Task Saya's rows carry no buttons: the creator hands a draft or a link in from Detail Konten,
// and the form opens inside that same panel instead of closing it for a second dialog.
describe("Detail Konten's hand-ins for a creator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  describe("Submit Draft", () => {
    it("opens the form inside the same panel, with the journey still in view", async () => {
      open(detail());

      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

      const dialog = screen.getByRole("dialog", { name: "Promo Lebaran" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByRole("textbox", { name: "Link File Draft" })).toBeInTheDocument();
      expect(within(dialog).getByRole("textbox", { name: "Catatan untuk Admin" })).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
      // The step's own button gives way to the form's, as the admin's note form does.
      expect(within(dialog).queryByRole("button", { name: "Submit Draft" })).toBeNull();
      expect(within(dialog).getByRole("button", { name: "Kirim Draft" })).toBeInTheDocument();
    });

    it("sends the draft for this content, confirms with a toast, and shows where the content stands now", async () => {
      const { load, submitDraft } = open(detail());
      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

      fireEvent.change(screen.getByRole("textbox", { name: "Link File Draft" }), {
        target: { value: "https://drive.google.com/file/d/abc/view" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "Catatan untuk Admin" }), {
        target: { value: "  Mohon dicek hook-nya  " },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Kirim Draft" }));
      });

      expect(submitDraft).toHaveBeenCalledExactlyOnceWith(CONTENT, {
        link: "https://drive.google.com/file/d/abc/view",
        notes: "Mohon dicek hook-nya",
      });
      expect(await screen.findByText("Draft terkirim. Admin akan meninjaunya.")).toBeInTheDocument();
      // Back to the step, and the list behind it and the panel's own read start afresh.
      expect(screen.queryByRole("textbox", { name: "Link File Draft" })).toBeNull();
      expect(refresh).toHaveBeenCalled();
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });

    it("puts Batal and Kirim Draft in the panel's foot, so the foot is never an empty bar", async () => {
      open(detail());

      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

      const foot = screen.getByRole("dialog").querySelector("[data-modal-footer]") as HTMLElement;
      expect(within(foot).getByRole("button", { name: "Kirim Draft" })).toBeInTheDocument();
      expect(within(foot).getByRole("button", { name: "Batal" })).toBeInTheDocument();
    });

    it("words a resubmit as the revision's answer", async () => {
      open(detail({ status: "draft_revision", creatorActions: ["resubmit_draft"] }));

      fireEvent.click(await screen.findByRole("button", { name: "Resubmit Draft" }));

      expect(screen.getByRole("button", { name: "Kirim Ulang Draft" })).toBeInTheDocument();
    });

    it("goes back to the step on Batal, with nothing sent", async () => {
      const { submitDraft } = open(detail());
      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

      fireEvent.click(screen.getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("textbox", { name: "Link File Draft" })).toBeNull();
      expect(screen.getByRole("button", { name: "Submit Draft" })).toBeInTheDocument();
      expect(submitDraft).not.toHaveBeenCalled();
    });

    it("asks before throwing away what was typed, whether by Batal or by closing the panel", async () => {
      const { onClose } = open(detail());
      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Link File Draft" }), {
        target: { value: "https://drive.google.com/file/d/abc/view" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Batal" }));
      expect(screen.getByRole("alertdialog", { name: "Batalkan pengiriman draft?" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Lanjut mengisi" }));
      expect(screen.getByRole("textbox", { name: "Link File Draft" })).toHaveValue(
        "https://drive.google.com/file/d/abc/view",
      );

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("says why a refused draft was refused, and stays open for another try", async () => {
      const { submitDraft } = open(detail());
      submitDraft.mockResolvedValue({ ok: false, message: "Draft gagal dikirim. Coba lagi." });
      fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Link File Draft" }), {
        target: { value: "https://drive.google.com/file/d/abc/view" },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Kirim Draft" }));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("Draft gagal dikirim. Coba lagi.");
      expect(screen.getByRole("textbox", { name: "Link File Draft" })).toBeInTheDocument();
    });
  });

  describe("Submit Link Video", () => {
    const APPROVED = { status: "draft_approved" as const, creatorActions: ["submit_video" as const] };

    it("opens a field per platform inside the same panel, with no lock reminder", async () => {
      open(detail(APPROVED));

      fireEvent.click(await screen.findByRole("button", { name: "Submit Link Video" }));

      const dialog = screen.getByRole("dialog", { name: "Promo Lebaran" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByRole("textbox", { name: "Link Instagram" })).toBeInTheDocument();
      expect(within(dialog).getByRole("textbox", { name: "Link TikTok" })).toBeInTheDocument();
      expect(within(dialog).queryByText(/dikunci saat invoice difinalisasi/)).toBeNull();
      expect(within(dialog).getByRole("button", { name: "Kirim Link" })).toBeDisabled();
    });

    it("confirms, saves the link, and tells the creator the content is done", async () => {
      const { saveLinks } = open(detail(APPROVED));
      fireEvent.click(await screen.findByRole("button", { name: "Submit Link Video" }));

      fireEvent.change(screen.getByRole("textbox", { name: "Link TikTok" }), {
        target: { value: "https://www.tiktok.com/@rangga/video/7312345678901234567" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Kirim Link" }));
      expect(screen.getByRole("alertdialog", { name: "Kirim link video?" })).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Ya, Kirim" }));
      });

      expect(saveLinks).toHaveBeenCalledExactlyOnceWith(
        CONTENT,
        expect.objectContaining({
          added: [{ platform: "tiktok", url: "https://www.tiktok.com/@rangga/video/7312345678901234567" }],
        }),
      );
      expect(await screen.findByText("Link video terkirim. Konten ini selesai.")).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Link TikTok" })).toBeNull();
      expect(refresh).toHaveBeenCalled();
    });

    // A sent content's links are changed from their own cards: the form opens in the card.
    describe("once a link is sent", () => {
      const SENT = {
        status: "link_submitted" as const,
        waitingOn: null,
        creatorActions: [],
        links: [
          {
            platform: "instagram" as const,
            url: "https://www.instagram.com/reel/ABC123/",
            submittedAt: "2026-10-18",
            performance: {
              platform: "instagram" as const,
              url: "https://www.instagram.com/reel/ABC123/",
              views: null,
              likes: null,
              comments: null,
              shares: null,
              state: "waiting" as const,
              lastSyncedAt: null,
              manualAt: null,
            },
          },
        ],
      };

      it("offers no Tambah / Ganti Link in the foot any more", async () => {
        open(detail(SENT));

        await screen.findByRole("button", { name: "Ubah link Instagram" });
        expect(screen.queryByRole("button", { name: "Tambah / Ganti Link" })).toBeNull();
      });

      it("changes a link from its card's pencil, the form in the card and its buttons in the foot", async () => {
        const { saveLinks } = open(detail(SENT));

        fireEvent.click(await screen.findByRole("button", { name: "Ubah link Instagram" }));

        const card = screen.getByRole("group", { name: "Performa Instagram" });
        const field = within(card).getByRole("textbox", { name: "Link Instagram" });
        expect(field).toHaveValue("https://www.instagram.com/reel/ABC123/");
        expect(screen.queryByRole("textbox", { name: "Link TikTok" })).toBeNull();
        const foot = screen.getByRole("dialog").querySelector("[data-modal-footer]") as HTMLElement;
        expect(within(foot).getByRole("button", { name: "Kirim Link" })).toBeInTheDocument();

        fireEvent.change(field, { target: { value: "https://www.instagram.com/reel/XYZ789/" } });
        fireEvent.click(within(foot).getByRole("button", { name: "Kirim Link" }));
        await act(async () => {
          fireEvent.click(await screen.findByRole("button", { name: "Ya, Kirim" }));
        });

        expect(saveLinks).toHaveBeenCalledExactlyOnceWith(
          CONTENT,
          expect.objectContaining({
            replaced: [{ platform: "instagram", url: "https://www.instagram.com/reel/XYZ789/" }],
            added: [],
          }),
        );
        expect(await screen.findByText("Link video diperbarui.")).toBeInTheDocument();
      });

      it("adds a link for a platform still without one from the + under the cards", async () => {
        const { saveLinks } = open(detail(SENT));

        fireEvent.click(await screen.findByRole("button", { name: "Tambah link TikTok" }));

        const field = screen.getByRole("textbox", { name: "Link TikTok" });
        expect(field).toHaveValue("");
        expect(screen.queryByRole("textbox", { name: "Link Instagram" })).toBeNull();
        fireEvent.change(field, {
          target: { value: "https://www.tiktok.com/@rangga/video/7312345678901234567" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Kirim Link" }));
        await act(async () => {
          fireEvent.click(await screen.findByRole("button", { name: "Ya, Kirim" }));
        });

        expect(saveLinks).toHaveBeenCalledExactlyOnceWith(
          CONTENT,
          expect.objectContaining({
            added: [{ platform: "tiktok", url: "https://www.tiktok.com/@rangga/video/7312345678901234567" }],
          }),
        );
      });

      it("goes back to the card on Batal", async () => {
        open(detail(SENT));
        fireEvent.click(await screen.findByRole("button", { name: "Ubah link Instagram" }));

        fireEvent.click(screen.getByRole("button", { name: "Batal" }));

        expect(screen.queryByRole("textbox", { name: "Link Instagram" })).toBeNull();
        expect(screen.getByRole("button", { name: "Ubah link Instagram" })).toBeInTheDocument();
      });
    });

    it("goes back to the step on Batal", async () => {
      open(detail(APPROVED));
      fireEvent.click(await screen.findByRole("button", { name: "Submit Link Video" }));

      fireEvent.click(screen.getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("textbox", { name: "Link Instagram" })).toBeNull();
      expect(screen.getByRole("button", { name: "Submit Link Video" })).toBeInTheDocument();
    });
  });
});
