import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DraftPreviewError, type DraftPreview } from "@/lib/draft-preview";
import { DraftPreviewModal } from "./draft-preview-modal";

// The modal is tested against a stubbed loader, not the network: what it renders for a
// given preview is its job, how the preview is fetched is lib/draft-preview's.
function preview(overrides: Partial<DraftPreview> = {}): DraftPreview {
  return {
    submissionId: "sub-2",
    contentName: "Promo Lebaran",
    creatorName: "Rangga Pratama",
    type: "specific",
    brief: "Tunjukkan fitur cashback.\nDurasi maksimal 30 detik.",
    deadline: "2026-10-05",
    status: "draft_review",
    draftLink: "https://drive.google.com/file/d/draft-2",
    revisions: [
      {
        submissionId: "sub-1",
        link: "https://drive.google.com/file/d/draft-1",
        note: "Audio terlalu pelan.\nTambahkan subtitle.",
        submittedAt: "2026-09-20T03:00:00.000Z",
        isCurrent: false,
      },
      {
        submissionId: "sub-2",
        link: "https://drive.google.com/file/d/draft-2",
        note: null,
        submittedAt: "2026-09-23T03:00:00.000Z",
        isCurrent: true,
      },
    ],
    ...overrides,
  };
}

type Props = ComponentProps<typeof DraftPreviewModal>;

function renderModal(props: Partial<Props> = {}) {
  const onClose = vi.fn();
  const load = vi.fn<NonNullable<Props["load"]>>().mockResolvedValue(preview());
  const utils = render(
    <DraftPreviewModal submissionId="sub-2" onClose={onClose} load={load} {...props} />,
  );
  return { ...utils, onClose, load };
}

/** Resolves only when the test says so, to look at the modal while it is still loading. */
function deferred() {
  let resolve!: (value: DraftPreview) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<DraftPreview>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function historyEntries() {
  const history = await screen.findByRole("list", { name: "Riwayat draft" });
  return within(history).getAllByRole("listitem");
}

describe("DraftPreviewModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("while loading", () => {
    it("says it is loading and asks for the submission it was opened on", () => {
      const pending = deferred();
      const { load } = renderModal({ load: vi.fn().mockReturnValue(pending.promise) });

      expect(screen.getByText("Memuat draft...")).toBeInTheDocument();
      expect(load).toHaveBeenCalledWith("sub-2");
    });

    it("keeps the review actions hidden until there is a draft to decide on", () => {
      const pending = deferred();
      renderModal({
        load: vi.fn().mockReturnValue(pending.promise),
        actions: <button type="button">Approve</button>,
      });

      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });
  });

  describe("once loaded", () => {
    it("titles the dialog with the content name", async () => {
      renderModal();

      expect(await screen.findByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });

    it("shows the creator, deadline, content type, and current status", async () => {
      renderModal();

      expect(await screen.findByText("Rangga Pratama")).toBeInTheDocument();
      expect(screen.getByText("5 Okt 2026")).toBeInTheDocument();
      expect(screen.getByText("Specific")).toBeInTheDocument();
      expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
    });

    it("shows a Specific content's brief with its line breaks kept", async () => {
      renderModal();

      const brief = await screen.findByText(/Tunjukkan fitur cashback\./);
      expect(brief).toHaveTextContent("Durasi maksimal 30 detik.");
      expect(brief).toHaveClass("whitespace-pre-line");
    });

    it("leaves the brief out for Evergreen content, which has none", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(preview({ type: "evergreen", brief: "" })) });

      expect(await screen.findByText("Evergreen")).toBeInTheDocument();
      expect(screen.queryByText("Brief")).not.toBeInTheDocument();
    });

    it("shows a dash when a Specific content's brief is empty", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(preview({ brief: "" })) });

      const brief = await screen.findByText("Brief");
      expect(brief.parentElement).toHaveTextContent("—");
    });

    it("opens the draft file in a new tab without handing it this page", async () => {
      renderModal();

      const link = await screen.findByRole("link", { name: "Buka file draft" });
      expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/draft-2");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("shows the review actions it was given next to Tutup", async () => {
      renderModal({ actions: <button type="button">Approve</button> });

      expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tutup" })).toBeInTheDocument();
    });

    it("closes from the Tutup button", async () => {
      const { onClose } = renderModal();

      fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("an unsafe draft link (OWASP A03)", () => {
    it("shows a non-web draft link as text instead of a link", async () => {
      renderModal({
        load: vi.fn().mockResolvedValue(
          preview({ draftLink: "javascript:alert(document.cookie)", revisions: [] }),
        ),
      });

      expect(await screen.findByText("javascript:alert(document.cookie)")).toBeInTheDocument();
      expect(screen.getByText(/bukan link web yang valid/i)).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("does the same for a link inside the history", async () => {
      const unsafe = preview();
      unsafe.revisions[0] = { ...unsafe.revisions[0], link: "data:text/html,<b>x</b>" };
      renderModal({ load: vi.fn().mockResolvedValue(unsafe) });

      const [first] = await historyEntries();
      expect(within(first).queryByRole("link")).not.toBeInTheDocument();
      expect(within(first).getByText("data:text/html,<b>x</b>")).toBeInTheDocument();
    });
  });

  describe("revision history", () => {
    it("numbers each draft oldest first with the time it was sent in WIB", async () => {
      renderModal();

      const [first, second] = await historyEntries();
      expect(first).toHaveTextContent("Draft ke-1");
      expect(first).toHaveTextContent("20 Sep 2026, 10.00 WIB");
      expect(second).toHaveTextContent("Draft ke-2");
      expect(second).toHaveTextContent("23 Sep 2026, 10.00 WIB");
    });

    it("shows the admin's revision note with its line breaks kept", async () => {
      renderModal();

      const [first] = await historyEntries();
      const note = within(first).getByText(/Audio terlalu pelan\./);
      expect(note).toHaveTextContent("Tambahkan subtitle.");
      expect(note).toHaveClass("whitespace-pre-line");
    });

    it("marks the draft being previewed as waiting for review", async () => {
      renderModal();

      const [, second] = await historyEntries();
      expect(second).toHaveTextContent("Menunggu review");
    });

    it("says so when an earlier draft was sent back without a note", async () => {
      const noNote = preview();
      noNote.revisions[0] = { ...noNote.revisions[0], note: null };
      renderModal({ load: vi.fn().mockResolvedValue(noNote) });

      const [first] = await historyEntries();
      expect(first).toHaveTextContent("Tanpa catatan revisi");
    });

    it("links each earlier draft so the admin can compare versions", async () => {
      renderModal();

      const [first] = await historyEntries();
      expect(within(first).getByRole("link", { name: "Lihat draft ke-1" })).toHaveAttribute(
        "href",
        "https://drive.google.com/file/d/draft-1",
      );
    });

    it("says so when there is no history to show", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(preview({ revisions: [] })) });

      expect(await screen.findByText("Belum ada riwayat draft.")).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Riwayat draft" })).not.toBeInTheDocument();
    });
  });

  describe("when loading fails", () => {
    it("says the draft was not found on a 404", async () => {
      renderModal({ load: vi.fn().mockRejectedValue(new DraftPreviewError(404)) });

      expect(await screen.findByText(/draft tidak ditemukan/i)).toBeInTheDocument();
    });

    it.each([
      ["a server error", new DraftPreviewError(500)],
      ["a network failure", new TypeError("Failed to fetch")],
    ])("asks to try again after %s", async (_label, failure) => {
      renderModal({ load: vi.fn().mockRejectedValue(failure) });

      expect(await screen.findByText(/gagal memuat draft/i)).toBeInTheDocument();
      expect(screen.queryByText(/draft tidak ditemukan/i)).not.toBeInTheDocument();
    });

    it("keeps the review actions hidden, since there is nothing to decide on", async () => {
      renderModal({
        load: vi.fn().mockRejectedValue(new DraftPreviewError(500)),
        actions: <button type="button">Approve</button>,
      });

      await screen.findByText(/gagal memuat draft/i);
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });
  });

  describe("after it is closed", () => {
    it("ignores a draft that arrives late", async () => {
      const pending = deferred();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { unmount } = renderModal({ load: vi.fn().mockReturnValue(pending.promise) });

      unmount();
      pending.resolve(preview());
      await pending.promise;

      expect(errors).not.toHaveBeenCalled();
    });

    it("ignores a failure that arrives late", async () => {
      const pending = deferred();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { unmount } = renderModal({ load: vi.fn().mockReturnValue(pending.promise) });

      unmount();
      pending.reject(new DraftPreviewError(500));
      await pending.promise.catch(() => {});

      expect(errors).not.toHaveBeenCalled();
    });
  });

  it("fetches through the API proxy when no loader is given", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(preview())));

    render(<DraftPreviewModal submissionId="sub-2" onClose={vi.fn()} />);

    expect(await screen.findByText("Rangga Pratama")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("/api/submissions/sub-2", { cache: "no-store" });
  });
});
