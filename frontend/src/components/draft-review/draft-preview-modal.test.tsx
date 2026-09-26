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
      { note: "Audio terlalu pelan.\nTambahkan subtitle.", date: "2026-09-20T03:00:00.000Z" },
      { note: "Intro masih kepanjangan.", date: "2026-09-22T17:30:00.000Z" },
    ],
    ...overrides,
  };
}

type Props = ComponentProps<typeof DraftPreviewModal>;

function renderModal(props: Partial<Props> = {}) {
  const onClose = vi.fn();
  // Hand back the loader the modal was actually given, so a test that passes its own can
  // assert on it rather than on an unused default.
  const load = props.load ?? vi.fn<NonNullable<Props["load"]>>().mockResolvedValue(preview());
  const utils = render(
    <DraftPreviewModal submissionId="sub-2" onClose={onClose} {...props} load={load} />,
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
  const history = await screen.findByRole("list", { name: "Riwayat revisi" });
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

    it("shows where the draft link leads before the admin opens it", async () => {
      renderModal();

      await screen.findByRole("link", { name: "Buka file draft" });
      expect(screen.getByText("https://drive.google.com/file/d/draft-2")).toBeInTheDocument();
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
  });

  describe("revision history", () => {
    it("numbers each revision oldest first with the time it was written in WIB", async () => {
      renderModal();

      const [first, second] = await historyEntries();
      expect(first).toHaveTextContent("Revisi ke-1");
      expect(first).toHaveTextContent("20 Sep 2026, 10.00 WIB");
      expect(second).toHaveTextContent("Revisi ke-2");
      // 17.30 UTC on the 22nd is already 00.30 on the 23rd in Jakarta.
      expect(second).toHaveTextContent("23 Sep 2026, 00.30 WIB");
    });

    it("shows the admin's revision note with its line breaks kept", async () => {
      renderModal();

      const [first] = await historyEntries();
      const note = within(first).getByText(/Audio terlalu pelan\./);
      expect(note).toHaveTextContent("Tambahkan subtitle.");
      expect(note).toHaveClass("whitespace-pre-line");
    });

    it("says so when there is no history to show", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(preview({ revisions: [] })) });

      expect(await screen.findByText("Belum ada riwayat revisi.")).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Riwayat revisi" })).not.toBeInTheDocument();
    });
  });

  // #36 answers without contentName, creatorName, deadline, and type until they are added.
  describe("while the API leaves out the header fields", () => {
    const withoutHeader = preview({
      contentName: null,
      creatorName: null,
      deadline: null,
      type: null,
    });

    function valueOf(label: string) {
      return screen.getByText(label).parentElement;
    }

    it("keeps the default title", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(withoutHeader) });

      await screen.findByRole("link", { name: "Buka file draft" });
      expect(screen.getByRole("dialog", { name: "Preview Draft" })).toBeInTheDocument();
    });

    it("shows dashes for the creator, deadline, and type", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(withoutHeader) });

      await screen.findByRole("link", { name: "Buka file draft" });
      expect(valueOf("Creator")).toHaveTextContent("—");
      expect(valueOf("Deadline")).toHaveTextContent("—");
      expect(valueOf("Tipe konten")).toHaveTextContent("—");
    });

    it("still shows the brief, since it cannot tell the content is Evergreen", async () => {
      renderModal({ load: vi.fn().mockResolvedValue(withoutHeader) });

      expect(await screen.findByText(/Tunjukkan fitur cashback\./)).toBeInTheDocument();
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
    // What the API sends (#36 plus the header fields), not the modal's own shape.
    const answer = {
      brief: "Tunjukkan fitur cashback.",
      link: "https://drive.google.com/file/d/draft-2",
      status: "draft_review",
      revisionHistory: [],
      contentName: "Promo Lebaran",
      creatorName: "Rangga Pratama",
      deadline: "2026-10-05",
      type: "specific",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(answer)));

    render(<DraftPreviewModal submissionId="sub-2" onClose={vi.fn()} />);

    expect(await screen.findByText("Rangga Pratama")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("/api/submissions/sub-2", { cache: "no-store" });
  });
});
