import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContentDetailError, type ContentDetail, type FollowUp } from "@/lib/content-detail";
import { DecisionError } from "@/lib/decisions";
import type { PanelActionPorts } from "@/lib/panel-actions";
import type { ScreenshotUploader, StoredImage } from "@/lib/revision-note-uploads";
import { REQUIRED_MARK } from "@/components/ui/form-classes";
import { withFollowUp } from "@/lib/follow-ups";
import { ContentDetailPanel, type Decision } from "./content-detail-panel";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const CONTENT = "11111111-1111-1111-1111-111111111111";
const SUBMISSION = "22222222-2222-2222-2222-222222222222";

function detail(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: CONTENT,
    name: "Promo Lebaran",
    type: "specific",
    brief: "Tunjukkan fitur cashback.",
    deadline: "2026-10-05",
    status: "draft_review",
    creatorName: "Rangga Pratama",
    tags: [],
    waitingOn: "admin",
    latestSubmissionId: SUBMISSION,
    creatorActions: [],
    links: [],
    events: [
      {
        id: "sub-2",
        type: "draft_submitted",
        at: "2026-09-20T10:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 2, link: "https://drive.google.com/draft-v2" },
      },
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

function open(
  loaded: ContentDetail | Promise<ContentDetail>,
  props: Partial<{
    role: "admin" | "creator";
    ports: PanelActionPorts;
    actions: ReactNode;
    onDecided: (decision: Decision) => void;
    uploader: ScreenshotUploader;
  }> = {},
) {
  const load = vi.fn().mockResolvedValue(loaded);
  const onClose = vi.fn();

  render(
    <ContentDetailPanel
      contentId={CONTENT}
      role={props.role ?? "admin"}
      onClose={onClose}
      load={load}
      {...(props.ports && { ports: props.ports })}
      {...(props.actions && { actions: props.actions })}
      {...(props.onDecided && { onDecided: props.onDecided })}
      uploader={props.uploader ?? quietUploader()}
    />,
  );

  return { load, onClose };
}

// PBI-34, 34.2: the revision note is a rich text editor (ProseMirror). jsdom does no layout, so
// empty rects stand in for the browser's when it scrolls the caret into view.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterAll(() => {
  delete (Range.prototype as Partial<Range>).getClientRects;
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});

// An uploader with nothing on the server and nothing ever uploaded: the panel's own tests need no
// screenshots.
function quietUploader(): ScreenshotUploader {
  return {
    upload: () => new Promise<StoredImage>(() => undefined),
    remove: () => Promise.resolve(),
    list: () => Promise.resolve([]),
  };
}

const NOTE = "Catatan revisi untuk creator";

// Writes the revision note as the Admin would paste it: the editor is not a textarea, so
// fireEvent.change has nothing to set.
async function typeNote(text: string, name = NOTE) {
  const box = await screen.findByRole("textbox", { name });
  act(() => box.focus());
  fireEvent.paste(box, {
    clipboardData: {
      types: ["text/plain"],
      files: [],
      items: [],
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
  return box;
}

describe("ContentDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the content it was opened by and shows the loading line meanwhile", async () => {
    let resolve!: (detail: ContentDetail) => void;
    const pending = new Promise<ContentDetail>((r) => {
      resolve = r;
    });

    open(pending);

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    resolve(detail());
    await screen.findByText("Promo Lebaran");
  });

  it("renders the header with type, status, deadline and the D-n countdown beside them", async () => {
    open(detail());

    expect(await screen.findByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText(/H-\d+|Hari ini|Lewat \d+ hari/)).toBeInTheDocument();
  });

  it("draws the Overdue tag beside the status, never as the status", async () => {
    open(
      detail({
        status: "draft_revision",
        tags: ["overdue"],
      }),
    );

    expect(await screen.findByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Draft Perlu Revisi")).toBeInTheDocument();
  });

  it("shows the step waiting on the admin with Approve and Minta Revisi for an admin", async () => {
    open(detail());

    expect(await screen.findByText("Menunggu Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Revisi" })).toBeInTheDocument();
  });

  it("shows an admin nothing to do while the step waits on the creator", async () => {
    open(detail({ waitingOn: "creator", status: "scheduled", latestSubmissionId: null }));

    expect(await screen.findByText("Menunggu kreator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  // The form's own buttons take the panel's foot, so the foot is never an empty bar and Kirim
  // Revisi stays in view however long the note grows.
  it("puts Batal and Kirim Revisi in the panel's foot while the note is open", async () => {
    open(detail());

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));

    const foot = screen.getByRole("dialog").querySelector("[data-modal-footer]") as HTMLElement;
    expect(within(foot).getByRole("button", { name: "Kirim Revisi" })).toBeInTheDocument();
    expect(within(foot).getByRole("button", { name: "Batal" })).toBeInTheDocument();
    expect(within(foot).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("keeps Kirim disabled while the note is empty or only spaces, and opens it after real text", async () => {
    open(detail());

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    const kirim = screen.getByRole("button", { name: "Kirim Revisi" });

    expect(kirim).toBeDisabled();

    await typeNote("   ");
    expect(kirim).toBeDisabled();

    await typeNote("Audio terlalu pelan.");
    await waitFor(() => expect(kirim).toBeEnabled());
  });

  // B2.4: the note is required, yet its label carried no asterisk as every other required field does.
  it("marks the revision note as required with the asterisk the other forms draw, keeping it out of the field's name", async () => {
    open(detail());

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));

    // The exact name: the asterisk is drawn by CSS, so a screen reader hears "required", not "star".
    expect(await screen.findByRole("textbox", { name: "Catatan revisi untuk creator" })).toBeRequired();
    expect(screen.getByText("Catatan revisi untuk creator")).toHaveClass(...REQUIRED_MARK.split(" "));
  });

  // Client feedback B4: the note is required (the backend refuses an empty or blank one), but
  // nothing on screen said so, and Kirim Revisi was disabled without a reason.
  describe("the required revision note", () => {
    async function openRevisionForm() {
      open(detail());
      fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
      return screen.findByRole("textbox", { name: "Catatan revisi untuk creator" });
    }

    it("says nothing is wrong before the admin has left the field", async () => {
      const note = await openRevisionForm();

      expect(note).not.toHaveAttribute("aria-invalid", "true");
      expect(screen.queryByText("Catatan revisi wajib diisi sebelum dikirim.")).toBeNull();
    });

    it("says why Kirim Revisi is unavailable once the field is left empty or blank", async () => {
      const note = await openRevisionForm();

      await typeNote("   ");
      fireEvent.blur(note);

      const message = await screen.findByText("Catatan revisi wajib diisi sebelum dikirim.");
      await waitFor(() => expect(note).toHaveAttribute("aria-invalid", "true"));
      expect(note.getAttribute("aria-describedby")).toContain(message.id);
      expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeDisabled();
    });

    it("clears the message as soon as real text is typed", async () => {
      const note = await openRevisionForm();
      fireEvent.blur(note);

      await typeNote("Audio terlalu pelan.");

      await waitFor(() =>
        expect(screen.queryByText("Catatan revisi wajib diisi sebelum dikirim.")).toBeNull(),
      );
      await waitFor(() => expect(note).toHaveAttribute("aria-invalid", "false"));
      expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled();
    });
  });

  // PBI-34: the note goes out as the editor's HTML, which 34.1 sanitizes and counts.
  it("sends the note with its formatting and reports the decision upward", async () => {
    const revise = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("Audio terlalu pelan.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    await waitFor(() => {
      expect(revise).toHaveBeenCalledWith(SUBMISSION, "<p>Audio terlalu pelan.</p>");
      expect(onDecided).toHaveBeenCalled();
    });
  });

  it("keeps the panel open with the backend's reason when a decision fails", async () => {
    const revise = vi
      .fn()
      .mockRejectedValue(new Error("Draft ini sudah tidak menunggu keputusan"));
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("Audio terlalu pelan.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: NOTE })).toHaveTextContent("Audio terlalu pelan.");
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // PBI-34, 34.2 (AC 5): Kirim Revisi waits while a screenshot is still uploading.
  it("keeps Kirim Revisi disabled while a screenshot uploads, and opens it once the upload is done", async () => {
    let finish: (stored: StoredImage) => void = () => undefined;
    const uploader: ScreenshotUploader = {
      upload: () => new Promise<StoredImage>((resolve) => (finish = resolve)),
      remove: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    };
    open(detail(), { uploader });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    const box = await typeNote("Audio terlalu pelan.");
    fireEvent.paste(box, {
      clipboardData: {
        types: ["Files"],
        files: [new File(["x"], "layar.png", { type: "image/png" })],
        items: [],
        getData: () => "",
      },
    });

    expect(await screen.findByText("Mengunggah 0%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeDisabled();

    await act(async () => finish({ imageId: "img-1", url: "/api/revision-note-images/img-1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled());
  });

  it("approves the latest hand-in through its command", async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { approve }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(SUBMISSION);
      expect(refresh).toHaveBeenCalled();
      expect(onDecided).toHaveBeenCalled();
    });
  });

  it("shows a creator their own next step instead of the review buttons", async () => {
    const onCreatorAction = vi.fn();
    open(
      detail({
        waitingOn: "creator",
        status: "draft_review",
        latestSubmissionId: null,
        creatorActions: ["submit_video"],
        // Far ahead, so the link reads as the H-1 route whatever day the test runs.
        deadline: "2099-12-31",
      }),
      { role: "creator", ports: { onCreatorAction } },
    );

    const button = await screen.findByRole("button", { name: "Submit Link (H-1)" });
    fireEvent.click(button);

    // With the content it shows, so the touchpoint can open a modal for a content its own
    // list does not hold.
    expect(onCreatorAction).toHaveBeenCalledExactlyOnceWith(
      "submit_video",
      expect.objectContaining({ status: "draft_review", deadline: "2099-12-31" }),
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("renders an injected action list instead of its own commands", async () => {
    open(detail(), { actions: <button type="button">Tinjau pengajuan</button> });

    expect(await screen.findByRole("button", { name: "Tinjau pengajuan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("reads a 404 as content that does not exist, not as a failure", async () => {
    open(Promise.reject(new ContentDetailError(404)));

    expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
  });

  it("reads a 400 (a link with a malformed id) as content that does not exist, with no retry", async () => {
    open(Promise.reject(new ContentDetailError(400)));

    expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Muat ulang" })).not.toBeInTheDocument();
  });

  it("reads any other failure as something to retry", async () => {
    open(Promise.reject(new ContentDetailError(500)));

    expect(
      await screen.findByText("Detail konten gagal dimuat"),
    ).toBeInTheDocument();
  });

  it("lists the journey newest first with each draft's version", async () => {
    open(detail());

    const journey = await screen.findByLabelText("Riwayat konten");
    const entries = journey.querySelectorAll("li");

    expect(entries[0]).toHaveTextContent("Draft v2 dikirim");
    expect(entries[1]).toHaveTextContent("Ditambahkan Admin");
  });

  it("names every event kind, counts a missing version, and shows an unusable link as inert text", async () => {
    open(
      detail({
        events: [
          {
            id: "sub-2",
            type: "draft_submitted",
            at: "2026-09-20T10:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
          },
          {
            id: "sub-2:revision",
            type: "revision_requested",
            at: "2026-09-19T10:00:00.000Z",
            actor: { name: null, role: "admin" },
            payload: { note: "Perbaiki bagian intro." },
          },
          {
            id: `${CONTENT}:approved`,
            type: "draft_approved",
            at: "2026-09-21T10:00:00.000Z",
            actor: { name: null, role: "admin" },
          },
          {
            id: `${CONTENT}:link`,
            type: "link_submitted",
            at: "2026-09-22T10:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
            payload: { link: "javascript:alert(1)" },
          },
        ],
      }),
    );

    const journey = await screen.findByLabelText("Riwayat konten");
    expect(journey).toHaveTextContent("Draft v1 dikirim");
    expect(journey).toHaveTextContent("Revisi ke-1 diminta");
    expect(journey).toHaveTextContent("Perbaiki bagian intro.");
    expect(journey).toHaveTextContent("Draft di-approve");
    expect(journey).toHaveTextContent("Link video dikirim");
    expect(journey).toHaveTextContent(
      "Link ini bukan link web yang valid, jadi tidak bisa dibuka.",
    );
    expect(within(journey).queryByRole("link")).toBeNull();
  });

  it("leaves out a missing creator name and an empty brief, and shows every tag pill", async () => {
    open(
      detail({
        type: "specific",
        creatorName: "",
        brief: "",
        tags: ["overdue", "approval_bypassed"],
      }),
    );

    await screen.findByText("Draft Menunggu Review");
    // Neither gets a placeholder: the breadcrumb and the Brief section are simply not there.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("Brief")).not.toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("Late Submission")).not.toBeInTheDocument();
    expect(screen.getByText("Approval di-bypass")).toBeInTheDocument();
  });

  it("reads a load that fails without a status as a plain failure", async () => {
    open(Promise.reject(new Error("gateway exploded")));

    expect(
      await screen.findByText("Detail konten gagal dimuat"),
    ).toBeInTheDocument();
  });

  it("stops caring about a load that settles after the panel was closed", async () => {
    let resolve!: (detail: ContentDetail) => void;
    const pending = new Promise<ContentDetail>((r) => {
      resolve = r;
    });

    const { unmount } = render(
      <ContentDetailPanel
        contentId={CONTENT}
        role="admin"
        onClose={vi.fn()}
        load={() => pending}
      />,
    );

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    unmount();
    resolve(detail());

    await waitFor(() => {
      expect(screen.queryByText("Promo Lebaran")).not.toBeInTheDocument();
    });
  });

  it("stops caring about a load that fails after the panel was closed", async () => {
    let reject!: (reason: unknown) => void;
    const pending = new Promise<ContentDetail>((_, r) => {
      reject = r;
    });

    const { unmount } = render(
      <ContentDetailPanel
        contentId={CONTENT}
        role="admin"
        onClose={vi.fn()}
        load={() => pending}
      />,
    );

    expect(await screen.findByText("Memuat konten...")).toBeInTheDocument();

    unmount();
    reject(new Error("too late"));

    await waitFor(() => {
      expect(screen.queryByText("Detail konten gagal dimuat")).not.toBeInTheDocument();
    });
  });

  it("keeps the panel open and shows the reason when Approve is refused", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(new Error("Draft ini sudah tidak menunggu keputusan"));
    const onDecided = vi.fn();
    open(detail(), { ports: { approve }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-reads the content after a 409, so the step stops offering a decision already taken", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(
        new DecisionError(409, "Draft ini sudah tidak menunggu keputusan"),
      );
    const { load } = open(detail(), { ports: { approve } });
    load.mockResolvedValueOnce(
      detail({ status: "draft_revision", waitingOn: "creator" }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Draft Perlu Revisi")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    // The content stays on screen while it is read again; nothing flashes "Memuat".
    expect(screen.queryByText("Memuat konten...")).not.toBeInTheDocument();
  });

  it("closes the note form after a 409 on Kirim Revisi, since there is nothing left to revise", async () => {
    const revise = vi
      .fn()
      .mockRejectedValue(
        new DecisionError(409, "Draft ini sudah tidak menunggu keputusan"),
      );
    const { load } = open(detail(), { ports: { revise } });
    load.mockResolvedValueOnce(detail({ status: "draft_approved", waitingOn: "creator" }));

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("Audio pelan.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Draft Approved")).toBeInTheDocument();
  });

  it("cancels the re-read after a 409 when the panel closes before it answers", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(
        new DecisionError(409, "Draft ini sudah tidak menunggu keputusan"),
      );
    let answer: (value: ContentDetail) => void = () => {};
    const { load } = open(detail(), { ports: { approve } });
    load.mockReturnValueOnce(new Promise<ContentDetail>((resolve) => (answer = resolve)));

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    cleanup();

    const signal = load.mock.calls[1][2] as AbortSignal;
    expect(signal.aborted).toBe(true);
    // Answering after the panel is gone changes nothing and throws nothing.
    answer(detail({ status: "draft_revision", waitingOn: "creator" }));
    await new Promise((settle) => setTimeout(settle, 0));
  });

  it("drops an earlier re-read when a second 409 asks for a newer one", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(
        new DecisionError(409, "Draft ini sudah tidak menunggu keputusan"),
      );
    const { load } = open(detail(), { ports: { approve } });
    // The first re-read never answers; the content still looks undecided meanwhile.
    load.mockReturnValueOnce(new Promise<ContentDetail>(() => {}));
    load.mockResolvedValueOnce(detail({ status: "draft_approved", waitingOn: "creator" }));

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Draft Approved")).toBeInTheDocument();
    expect((load.mock.calls[1][2] as AbortSignal).aborted).toBe(true);
  });

  it("does not re-read the content when a decision fails for another reason", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(new DecisionError(500, "Keputusan gagal dikirim. Coba lagi."));
    const { load } = open(detail(), { ports: { approve } });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Keputusan gagal dikirim. Coba lagi.")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("keeps the last content and the reason when the re-read after a 409 fails too", async () => {
    const approve = vi
      .fn()
      .mockRejectedValue(
        new DecisionError(409, "Draft ini sudah tidak menunggu keputusan"),
      );
    const { load } = open(detail(), { ports: { approve } });
    load.mockRejectedValueOnce(new ContentDetailError(503));

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("heading", { name: "Promo Lebaran" })).toBeInTheDocument();
    expect(screen.queryByText("Detail konten gagal dimuat")).not.toBeInTheDocument();
  });

  it("names the decision it reports upward, so the touchpoint can confirm it", async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { approve }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(onDecided).toHaveBeenCalledWith("approve");
    });
  });

  it("reports a sent revision upward as a revision", async () => {
    const revise = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("Audio pelan.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    await waitFor(() => {
      expect(onDecided).toHaveBeenCalledWith("revise");
    });
  });

  describe("a creator's proposal", () => {
    const proposal = () =>
      detail({
        status: "pending",
        waitingOn: "admin",
        latestSubmissionId: null,
        events: [
          {
            id: `${CONTENT}:scheduled`,
            type: "scheduled",
            at: "2026-09-01T03:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
          },
        ],
      });

    it("asks the admin to decide, with Tolak and Setujui", async () => {
      open(proposal());

      expect(await screen.findByRole("button", { name: "Setujui" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Tolak" })).toBeEnabled();
      expect(screen.getByTestId("step-text")).toHaveTextContent(
        "Kreator mengajukan konten ini. Setujui untuk menjadwalkannya, atau tolak untuk menghapusnya.",
      );
    });

    it("keeps the optional rejection reason free of a required mark or message", async () => {
      open(proposal());

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
      const reason = screen.getByRole("textbox", { name: "Alasan penolakan (opsional)" });
      fireEvent.blur(reason);

      expect(reason).not.toBeRequired();
      expect(screen.queryByText("*")).toBeNull();
      expect(reason).not.toHaveAttribute("aria-invalid", "true");
    });

    it("tells the proposing creator it is with the admin, with nothing to press", async () => {
      open(proposal(), { role: "creator" });

      expect(await screen.findByTestId("step-text")).toHaveTextContent(
        "Pengajuan sedang ditinjau Admin.",
      );
      expect(screen.queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tolak" })).not.toBeInTheDocument();
    });

    it("approves it, refreshes and reports the decision by name", async () => {
      const approveProposal = vi.fn().mockResolvedValue(undefined);
      const onDecided = vi.fn();
      open(proposal(), { ports: { approveProposal }, onDecided });

      fireEvent.click(await screen.findByRole("button", { name: "Setujui" }));

      await waitFor(() => {
        expect(approveProposal).toHaveBeenCalledWith(CONTENT);
        expect(refresh).toHaveBeenCalled();
        expect(onDecided).toHaveBeenCalledWith("approve_proposal");
      });
    });

    it("opens an optional reason form on Tolak, with focus in it and nothing sent yet", async () => {
      const rejectProposal = vi.fn();
      open(proposal(), { ports: { rejectProposal } });

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));

      const reason = screen.getByRole("textbox", { name: "Alasan penolakan (opsional)" });
      expect(reason).toHaveFocus();
      expect(reason).toHaveAttribute("maxLength", "1000");
      expect(screen.getByRole("button", { name: "Tolak Pengajuan" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();
      expect(rejectProposal).not.toHaveBeenCalled();
    });

    it("leaves the optional reason without the required mark, as nothing has to be written", async () => {
      open(proposal());

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));

      expect(screen.getByRole("textbox", { name: "Alasan penolakan (opsional)" })).not.toBeRequired();
      expect(screen.getByText("Alasan penolakan (opsional)")).not.toHaveClass("after:content-['*']");
    });

    it("rejects with the reason trimmed and reports it by name", async () => {
      const rejectProposal = vi.fn().mockResolvedValue(undefined);
      const onDecided = vi.fn();
      open(proposal(), { ports: { rejectProposal }, onDecided });

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Kurang relevan.  " } });
      fireEvent.click(screen.getByRole("button", { name: "Tolak Pengajuan" }));

      await waitFor(() => {
        expect(rejectProposal).toHaveBeenCalledWith(CONTENT, "Kurang relevan.");
        expect(onDecided).toHaveBeenCalledWith("reject_proposal");
      });
    });

    it("rejects without a reason too", async () => {
      const rejectProposal = vi.fn().mockResolvedValue(undefined);
      open(proposal(), { ports: { rejectProposal } });

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
      fireEvent.click(screen.getByRole("button", { name: "Tolak Pengajuan" }));

      await waitFor(() => {
        expect(rejectProposal).toHaveBeenCalledWith(CONTENT, "");
      });
    });

    it("goes back from the reason form on Batal, dropping what was typed", async () => {
      open(proposal());

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kurang relevan." } });
      fireEvent.click(screen.getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
      expect(screen.getByRole("textbox")).toHaveValue("");
    });

    it("re-reads after a 409, when someone else already decided or H-1 scheduled it", async () => {
      const approveProposal = vi
        .fn()
        .mockRejectedValue(
          new DecisionError(409, "Pengajuan ini sudah tidak menunggu keputusan"),
        );
      const { load } = open(proposal(), { ports: { approveProposal } });
      load.mockResolvedValueOnce(detail({ status: "scheduled", waitingOn: "creator", latestSubmissionId: null }));

      fireEvent.click(await screen.findByRole("button", { name: "Setujui" }));

      expect(
        await screen.findByText("Pengajuan ini sudah tidak menunggu keputusan"),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();
      });
      expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });

    it("keeps the reason form and the typed reason when the rejection fails for another reason", async () => {
      const rejectProposal = vi
        .fn()
        .mockRejectedValue(new DecisionError(500, "Pengajuan gagal ditolak. Coba lagi."));
      open(proposal(), { ports: { rejectProposal } });

      fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kurang relevan." } });
      fireEvent.click(screen.getByRole("button", { name: "Tolak Pengajuan" }));

      expect(await screen.findByText("Pengajuan gagal ditolak. Coba lagi.")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("Kurang relevan.");
    });
  });

  it("answers a decision that fails without an Error with its own generic message", async () => {
    const approve = vi.fn().mockRejectedValue("not even an error");
    open(detail(), { ports: { approve } });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Terjadi kesalahan. Coba lagi.")).toBeInTheDocument();
  });
});

// Subtask 6.5: the panel as a side sheet with a worded, vertical timeline. Rendered through its
// own helper so a test can pin "today", close the panel, or re-render it.
describe("ContentDetailPanel as the content's side sheet (6.5)", () => {
  /** Midday in Jakarta on 2 Oct 2026, three days before the fixture's deadline. */
  const NOW = new Date("2026-10-02T05:00:00Z");

  type Loader = NonNullable<Parameters<typeof ContentDetailPanel>[0]["load"]>;

  describe("the submitted links (AC 11)", () => {
    it("lists one row per link: the mark, the link in a new tab, and its date", async () => {
      open(
        detail({
          links: [
            {
              platform: "instagram",
              url: "https://instagram.com/p/x",
              submittedAt: "2026-10-18",
            },
            {
              platform: "tiktok",
              url: "https://tiktok.com/@a/video/1",
              submittedAt: "2026-10-19",
            },
          ],
        }),
      );

      const section = await screen.findByRole("region", { name: "Tautan video" });
      expect(within(section).getByRole("img", { name: "Instagram" })).toBeInTheDocument();
      expect(within(section).getByRole("img", { name: "TikTok" })).toBeInTheDocument();
      const ig = within(section).getByRole("link", { name: /Instagram/ });
      expect(ig).toHaveAttribute("target", "_blank");
      expect(within(section).getByText("18 Okt 2026")).toBeInTheDocument();
    });

    it("keeps a link from before platforms were recorded: listed unnamed, without a mark", async () => {
      open(
        detail({
          links: [{ platform: null, url: "https://example.com/video/old", submittedAt: "2026-09-15" }],
        }),
      );

      const section = await screen.findByRole("region", { name: "Tautan video" });
      expect(within(section).queryByRole("img")).not.toBeInTheDocument();
      expect(within(section).getByRole("link", { name: "Link" })).toHaveAttribute(
        "target",
        "_blank",
      );
      expect(within(section).getByText("15 Sep 2026")).toBeInTheDocument();
    });

    describe("with each link's performance (PBI-27 27.5)", () => {
      const measured = {
        platform: "instagram" as const,
        url: "https://instagram.com/reel/abc",
        submittedAt: "2026-10-18",
        performance: {
          views: 12400,
          likes: null,
          comments: null,
          shares: null,
          state: "not_connected" as const,
          lastSyncedAt: null,
          manualAt: null,
        },
      };

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("shows a card per link with its numbers and state instead of the plain rows", async () => {
        open(detail({ status: "link_submitted", links: [measured] }));

        const section = await screen.findByRole("region", { name: "Link dan performa" });
        const card = within(section).getByRole("group", { name: "Performa Instagram" });
        expect(within(card).getByText("12.400")).toBeInTheDocument();
        expect(within(card).getByText("Akun belum terhubung")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Tautan video" })).not.toBeInTheDocument();
      });

      it("names the creator by first name in the not-connected tip", async () => {
        open(detail({ status: "link_submitted", links: [measured] }));

        expect(
          await screen.findByRole("button", { name: "Tentang Akun belum terhubung" }),
        ).toHaveAccessibleDescription("Rangga belum menghubungkan akun ini.");
      });

      it("reads the content again once manual numbers are saved, so the card shows them", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200 }));
        const { load } = open(detail({ status: "link_submitted", links: [measured] }));

        fireEvent.click(await screen.findByRole("button", { name: "Isi Manual" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Views" }), { target: { value: "500" } });
        fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Simpan" }));

        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      });

      it("gives a creator the numbers without Sinkronkan Sekarang or Isi Manual (AC 20)", async () => {
        open(detail({ status: "link_submitted", links: [measured] }), { role: "creator" });

        const section = await screen.findByRole("region", { name: "Link dan performa" });
        expect(within(section).getByText("12.400")).toBeInTheDocument();
        expect(within(section).queryByRole("button", { name: "Sinkronkan Sekarang" })).toBeNull();
        expect(within(section).queryByRole("button", { name: "Isi Manual" })).toBeNull();
      });
    });

    it("shows no link section while nothing has been sent", async () => {
      open(detail({ links: [] }));

      // The journey is the sign the content has loaded; only then is its absence meaningful.
      await screen.findByRole("list", { name: "Riwayat konten" });

      expect(screen.queryByRole("region", { name: "Tautan video" })).not.toBeInTheDocument();
    });

    it("names the timeline event after the platform the link was sent to (AC 12)", async () => {
      open(
        detail({
          status: "link_submitted",
          links: [
            {
              platform: "instagram",
              url: "https://instagram.com/p/x",
              submittedAt: "2026-10-18",
            },
          ],
          events: [
            {
              id: "ev-1",
              type: "link_submitted",
              at: "2026-10-18T03:00:00.000Z",
              actor: { name: "Rangga Pratama", role: "creator" },
              payload: { link: "https://instagram.com/p/x", platform: "instagram" },
            },
          ],
        }),
      );

      expect(await screen.findByText("Link Instagram dikirim")).toBeInTheDocument();
    });

    it("says a replaced link took the place of another (AC 9)", async () => {
      open(
        detail({
          status: "link_submitted",
          links: [
            { platform: "instagram", url: "https://instagram.com/p/new", submittedAt: "2026-10-19" },
          ],
          events: [
            {
              id: "ev-1",
              type: "link_submitted",
              at: "2026-10-19T03:00:00.000Z",
              actor: { name: "Rangga Pratama", role: "creator" },
              payload: { link: "https://instagram.com/p/new", platform: "instagram", replaced: true },
            },
          ],
        }),
      );

      expect(await screen.findByText("Link Instagram diganti")).toBeInTheDocument();
    });
  });

  function show(overrides: Partial<ContentDetail> = {}, load?: Loader) {
    const loader = load ?? vi.fn<Loader>().mockResolvedValue(detail(overrides));
    const onClose = vi.fn();
    const utils = render(
      <ContentDetailPanel contentId={CONTENT} role="admin" onClose={onClose} load={loader} now={NOW} />,
    );
    return { ...utils, load: loader, onClose };
  }

  async function journeyItems() {
    const journey = await screen.findByLabelText("Riwayat konten");
    return within(journey).getAllByRole("listitem");
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("header", () => {
    it("opens docked to the right edge, titled with the content name", async () => {
      show();

      const dialog = await screen.findByRole("dialog", { name: "Promo Lebaran" });
      expect(dialog).toHaveClass("h-full", "max-w-[520px]");
    });

    it("names the creator above the title, and nothing when the name is unknown", async () => {
      const { unmount } = show();
      expect(await screen.findByTestId("modal-eyebrow")).toHaveTextContent("Rangga Pratama");
      unmount();

      show({ creatorName: "" });
      await screen.findByRole("dialog", { name: "Promo Lebaran" });
      expect(screen.queryByTestId("modal-eyebrow")).not.toBeInTheDocument();
    });

    it("draws the type as a badge, as the tables do, and keeps the status a dot", async () => {
      show({ tags: ["overdue", "approval_bypassed"] });

      const meta = await screen.findByTestId("modal-meta");
      const status = within(meta).getByText("Draft Menunggu Review");

      expect(within(meta).getByText("Specific")).toHaveClass("rounded-full", "bg-accent-wash");
      expect(status).not.toHaveClass("rounded-full");
      expect(status.querySelector(".bg-accent")).not.toBeNull();
      expect(within(meta).getByText("Overdue")).toHaveClass("rounded-full", "bg-red-wash");
      expect(within(meta).getByText("Approval di-bypass")).toHaveClass("rounded-full", "bg-amber-wash");
    });

    it("lists the tags the way every other screen does, in the order the API sends them", async () => {
      show({ tags: ["overdue", "approval_bypassed"] });

      const meta = await screen.findByTestId("modal-meta");
      const tags = within(meta).getByRole("list", { name: "Tanda konten" });
      expect(
        within(tags)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Overdue", "Approval di-bypass"]);
    });

    it("draws no tag list for a content nothing is flagged on", async () => {
      show();

      const meta = await screen.findByTestId("modal-meta");
      expect(within(meta).queryByRole("list")).not.toBeInTheDocument();
    });

    it("shows the deadline as a date with its countdown in brackets beside it", async () => {
      show();

      const meta = await screen.findByTestId("modal-meta");
      expect(meta).toHaveTextContent("Deadline 5 Okt 2026 (H-3)");
      expect(within(meta).getByTestId("deadline-due")).toHaveTextContent("H-3");
    });

    it("puts the deadline on a line of its own under the badges, not on one long row", async () => {
      show({ tags: ["overdue"] });

      const meta = await screen.findByTestId("modal-meta");
      const rows = meta.querySelectorAll("[data-meta-row]");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveClass("basis-full");
      expect(rows[0]).toHaveTextContent("Specific");
      expect(rows[0]).toHaveTextContent("Overdue");
      expect(rows[0]).not.toHaveTextContent("Deadline");
      expect(rows[1]).toHaveClass("basis-full");
      expect(rows[1]).toHaveTextContent("Deadline 5 Okt 2026");
    });

    it.each([
      ["2026-09-30", "Lewat 2 hari", "text-red-ink"],
      ["2026-10-01", "Lewat 1 hari", "text-red-ink"],
      ["2026-10-02", "Hari ini", "text-amber-ink"],
      ["2026-10-03", "H-1", "text-amber-ink"],
    ])("warns about a %s deadline: %s in %s", async (deadline, label, tone) => {
      show({ deadline });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent(label);
      expect(due).toHaveClass(tone);
    });

    it.each([
      ["two days away", "2026-10-04", "H-2"],
      ["that cannot be read", "segera", "—"],
    ])("leaves a deadline %s uncoloured", async (_label, deadline, label) => {
      show({ deadline });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent(label);
      expect(due.className).not.toMatch(/text-(red|amber|green)-ink/);
    });

    it("leaves a pending proposal's passed deadline uncoloured, as it carries no Overdue tag either", async () => {
      show({ status: "pending", waitingOn: "admin", latestSubmissionId: null, deadline: "2026-09-30" });

      const due = await screen.findByTestId("deadline-due");
      expect(due).toHaveTextContent("Lewat 2 hari");
      expect(due.className).not.toMatch(/text-(red|amber|green)-ink/);
    });

    it("shows only the date once the video link is in, with no countdown and no Selesai", async () => {
      show({ status: "link_submitted", waitingOn: null, deadline: "2026-09-01" });

      const meta = await screen.findByTestId("modal-meta");
      expect(meta).toHaveTextContent("Deadline 1 Sep 2026");
      expect(within(meta).queryByTestId("deadline-due")).toBeNull();
      expect(within(meta).queryByText(/Selesai/)).toBeNull();
      expect(meta).not.toHaveTextContent("(");
    });

    it("counts the deadline from the current day when no day is pinned", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-04T05:00:00Z"));

      try {
        render(
          <ContentDetailPanel
            contentId={CONTENT}
            role="admin"
            onClose={() => {}}
            load={vi.fn<Loader>().mockResolvedValue(detail())}
          />,
        );

        expect(await screen.findByTestId("deadline-due")).toHaveTextContent("H-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows a status this build does not know as its raw name, with no step text, and does not crash", async () => {
      show({ status: "archived" as ContentDetail["status"] });

      const meta = await screen.findByTestId("modal-meta");
      const status = within(meta).getByText("archived");

      expect(status.querySelector(".bg-rule")).not.toBeNull();
      expect(screen.getByText("Menunggu Admin")).toBeInTheDocument();
      expect(screen.queryByTestId("step-text")).not.toBeInTheDocument();
    });
  });

  describe("brief", () => {
    it("shows a Specific content's brief with its line breaks kept", async () => {
      show({ brief: "Tunjukkan fitur cashback.\nDurasi maksimal 30 detik." });

      const brief = await screen.findByText(/Tunjukkan fitur cashback\./);
      expect(brief).toHaveTextContent("Durasi maksimal 30 detik.");
      expect(brief).toHaveClass("whitespace-pre-line");
    });

    it.each([
      ["an Evergreen content with none written", { type: "evergreen", brief: "" }],
      ["a Specific content with none written", { brief: "" }],
    ] as const)("leaves the brief out for %s", async (_label, overrides) => {
      show(overrides);

      await journeyItems();
      expect(screen.queryByText("Brief")).not.toBeInTheDocument();
    });

    it("shows an Evergreen content's brief once an admin has written one (PBI-25 AC 2)", async () => {
      show({ type: "evergreen", brief: "Sapa pengikut baru." });

      expect(await screen.findByText("Sapa pengikut baru.")).toBeInTheDocument();
      expect(screen.getByText("Brief")).toBeInTheDocument();
    });

    it("shows a brief of exactly 160 characters whole, with nothing to expand", async () => {
      const brief = "a".repeat(160);
      show({ brief });

      expect(await screen.findByText(brief)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Selengkapnya" })).not.toBeInTheDocument();
    });

    it("cuts a longer brief at 160 characters, then expands and folds it back", async () => {
      const brief = `${"a".repeat(160)}b`;
      show({ brief });

      const more = await screen.findByRole("button", { name: "Selengkapnya" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(`${"a".repeat(160)}…`)).toBeInTheDocument();

      fireEvent.click(more);
      const less = screen.getByRole("button", { name: "Ringkas" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(brief)).toBeInTheDocument();

      fireEvent.click(less);
      expect(screen.queryByText(brief)).not.toBeInTheDocument();
    });

    it("never cuts through an emoji sitting on the 160th character", async () => {
      show({ brief: `${"a".repeat(159)}😀b` });

      await screen.findByRole("button", { name: "Selengkapnya" });
      expect(screen.getByText(`${"a".repeat(159)}😀…`)).toBeInTheDocument();
    });
  });

  describe("current step", () => {
    it.each([
      ["admin", "Menunggu Admin", ["border-accent", "bg-accent-wash"], "text-accent-deep"],
      ["creator", "Menunggu kreator", ["border-amber", "bg-amber-wash"], "text-amber-ink"],
    ] as const)("tints the step by who it waits on: %s", async (waitingOn, label, card, text) => {
      show({ waitingOn });

      const who = await screen.findByText(label);
      expect(who).toHaveClass(text);
      expect(screen.getByTestId("current-step")).toHaveClass(...card);
    });

    it("turns the step green and reads Selesai once nothing is left to do", async () => {
      show({ status: "link_submitted", waitingOn: null });

      const step = await screen.findByTestId("current-step");
      expect(within(step).getByText("Selesai")).toHaveClass("text-green-ink");
      expect(step).toHaveClass("border-green", "bg-green-wash");
      expect(within(step).getByTestId("step-text")).toHaveTextContent("Link video sudah dikirim.");
    });

    it("reads a pending proposal as waiting on the admin's answer, worded as the admin's to give", async () => {
      show({ status: "pending", waitingOn: "admin", latestSubmissionId: null });

      const step = await screen.findByTestId("current-step");
      expect(within(step).getByText("Menunggu Admin")).toBeInTheDocument();
      expect(within(step).getByTestId("step-text")).toHaveTextContent(
        "Kreator mengajukan konten ini. Setujui untuk menjadwalkannya, atau tolak untuk menghapusnya.",
      );
    });

    it("sits above the history, so the next step is read first", async () => {
      show();

      const step = await screen.findByTestId("current-step");
      const journey = screen.getByLabelText("Riwayat konten");
      expect(step.compareDocumentPosition(journey)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  describe("timeline", () => {
    const FULL: ContentDetail["events"] = [
      {
        id: "link",
        type: "link_submitted",
        at: "2026-09-24T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { link: "https://www.instagram.com/reel/abc" },
      },
      { id: "ok", type: "draft_approved", at: "2026-09-23T03:00:00.000Z", actor: { name: null, role: "admin" } },
      {
        id: "sub-2",
        type: "draft_submitted",
        at: "2026-09-22T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 2, link: "https://drive.google.com/draft-v2", note: "Opening sudah diganti." },
      },
      {
        id: "rev-1",
        type: "revision_requested",
        at: "2026-09-21T03:00:00.000Z",
        actor: { name: "dewi.admin@tofly.id", role: "admin" },
        payload: { note: "Audio terlalu pelan.\nTambahkan subtitle." },
      },
      {
        id: "sub-1",
        type: "draft_submitted",
        at: "2026-09-20T03:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 1, link: "https://drive.google.com/draft-v1" },
      },
      { id: "sch", type: "scheduled", at: "2026-09-01T03:00:00.000Z", actor: { name: null, role: "admin" } },
    ];

    it("titles every event with its draft version or revision round, newest first", async () => {
      show({ events: FULL });

      const titles = (await journeyItems()).map(
        (item) => item.querySelector("[data-step-title]")?.textContent,
      );

      expect(titles).toEqual([
        "Link video dikirim",
        "Draft di-approve",
        "Draft v2 dikirim",
        "Revisi ke-1 diminta",
        "Draft v1 dikirim",
        "Ditambahkan Admin",
      ]);
    });

    // Each dot takes the tone of the status the event moved the content into, the same tone
    // that status has everywhere else; red stays reserved for a missed deadline.
    it("marks each event with a ringed dot in the tone of the status it led to", async () => {
      show({ events: FULL });

      const dots = (await journeyItems()).map(
        (item) => item.querySelector("[data-timeline-dot]")?.className ?? "",
      );

      expect(dots[0]).toContain("bg-green ring-green");
      expect(dots[1]).toContain("bg-green ring-green");
      expect(dots[2]).toContain("bg-accent ring-accent");
      expect(dots[3]).toContain("bg-amber ring-amber");
      expect(dots[4]).toContain("bg-accent ring-accent");
      expect(dots[5]).toContain("bg-muted ring-muted");
      expect(dots.join(" ")).not.toContain("bg-red");
    });

    it("marks an approved proposal and a creator's comment as steps that move nothing on", async () => {
      show({
        events: [
          {
            id: "comment",
            type: "creator_comment",
            at: "2026-09-03T03:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
            payload: { note: "Boleh mundur sehari?" },
          },
          {
            id: "proposal",
            type: "proposal_approved",
            at: "2026-09-02T03:00:00.000Z",
            actor: { name: null, role: "admin" },
          },
        ],
      });

      const items = await journeyItems();
      expect(items.map((item) => item.querySelector("[data-step-title]")?.textContent)).toEqual([
        "Komentar kreator",
        "Pengajuan disetujui",
      ]);
      expect(items.map((item) => item.querySelector("[data-timeline-dot]")?.className)).toEqual([
        expect.stringContaining("bg-muted ring-muted"),
        expect.stringContaining("bg-muted ring-muted"),
      ]);
      expect(within(items[0]).getByText("Boleh mundur sehari?")).toBeInTheDocument();
    });

    it("names the system as the actor of an H-1 scheduling, with a neutral dot", async () => {
      show({
        events: [
          {
            id: "auto",
            type: "auto_scheduled",
            at: "2026-09-02T03:00:00.000Z",
            actor: { name: null, role: "system" },
          },
        ],
      });

      const [item] = await journeyItems();
      expect(item.querySelector("[data-step-title]")).toHaveTextContent("Dijadwalkan otomatis (H-1)");
      expect(item.querySelector("[data-step-actor]")).toHaveTextContent("Sistem");
      expect(item.querySelector("[data-timeline-dot]")?.className).toContain("bg-muted ring-muted");
    });

    it("shows when each event happened in Jakarta time, and who did it in which role", async () => {
      show({ events: FULL });

      const items = await journeyItems();

      expect(within(items[2]).getByText("22 Sep 2026, 10.00 WIB")).toHaveAttribute(
        "datetime",
        "2026-09-22T03:00:00.000Z",
      );
      expect(items[2]).toHaveTextContent("Rangga Pratama · Kreator");
      expect(items[3]).toHaveTextContent("dewi.admin@tofly.id · Admin");
    });

    // The revision's time sits in its grey note box, beside who wrote it, not on the title line.
    it("puts a revision request's time inside its note box, not beside its title", async () => {
      show({ events: FULL });

      const revision = (await journeyItems())[3];
      const time = within(revision).getByText("21 Sep 2026, 10.00 WIB");
      expect(time.closest("blockquote")).not.toBeNull();
      expect(revision.querySelector("[data-step-title]")?.parentElement).not.toContainElement(time);
    });

    it("shows an event the API dates by day alone without a time", async () => {
      show({
        status: "link_submitted",
        waitingOn: null,
        events: [
          {
            id: "link",
            type: "link_submitted",
            at: "2026-09-25",
            actor: { name: "Rangga Pratama", role: "creator" },
            payload: { link: "https://www.instagram.com/reel/abc" },
          },
        ],
      });

      const [link] = await journeyItems();
      expect(within(link).getByText("25 Sep 2026")).toHaveAttribute("datetime", "2026-09-25");
      expect(link).not.toHaveTextContent("WIB");
    });

    it("names only the role when the API sends no actor name", async () => {
      show({ events: FULL });

      const actor = (await journeyItems())[5].querySelector("[data-step-actor]");
      expect(actor).toHaveTextContent(/^Admin$/);
    });

    it("opens a draft or the video in a new tab from a chip labelled with what it is", async () => {
      show({ events: FULL });

      const draft = await screen.findByRole("link", { name: /Buka draft v2/ });
      expect(draft).toHaveAttribute("href", "https://drive.google.com/draft-v2");
      expect(draft).toHaveAttribute("target", "_blank");
      expect(draft).toHaveAttribute("rel", "noopener noreferrer");
      expect(draft).toHaveClass("border");
      expect(screen.getByRole("link", { name: /Buka video/ })).toHaveAttribute(
        "href",
        "https://www.instagram.com/reel/abc",
      );
      expect(within((await journeyItems())[1]).queryByRole("link")).not.toBeInTheDocument();
    });

    it("quotes a note under its event, signed, with its line breaks kept", async () => {
      show({ events: FULL });

      const items = await journeyItems();
      const note = within(items[3]).getByText(/Audio terlalu pelan\./);

      expect(within(items[3]).getByText("Catatan dewi.admin@tofly.id")).toBeInTheDocument();
      expect(note).toHaveTextContent("Tambahkan subtitle.");
      expect(note).toHaveClass("whitespace-pre-line");
      expect(within(items[2]).getByText("Catatan Rangga Pratama")).toBeInTheDocument();
      expect(within(items[4]).queryByText(/^Catatan/)).not.toBeInTheDocument();
    });

    it("says so when nothing has happened yet", async () => {
      show({ events: [] });

      expect(await screen.findByText("Belum ada riwayat.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Riwayat konten")).not.toBeInTheDocument();
    });
  });

  describe("loading", () => {
    it("raises an alert with a way to retry when the load fails", async () => {
      show({}, vi.fn<Loader>().mockRejectedValue(new ContentDetailError(500)));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Detail konten gagal dimuat");
      expect(within(alert).getByRole("button", { name: "Muat ulang" })).toBeInTheDocument();
    });

    it("offers no retry for a content that does not exist", async () => {
      show({}, vi.fn<Loader>().mockRejectedValue(new ContentDetailError(404)));

      expect(await screen.findByText("Konten tidak ditemukan.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Muat ulang" })).not.toBeInTheDocument();
    });

    it("loads again on retry, showing the loading line and then the content", async () => {
      let finish!: (value: ContentDetail) => void;
      const load = vi
        .fn<Loader>()
        .mockRejectedValueOnce(new ContentDetailError(500))
        .mockReturnValueOnce(new Promise<ContentDetail>((resolve) => (finish = resolve)));
      show({}, load);

      fireEvent.click(await screen.findByRole("button", { name: "Muat ulang" }));

      expect(screen.getByText("Memuat konten...")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);

      finish(detail());
      expect(await screen.findByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });

    it("hands the loader a signal and cancels the request when the panel closes", async () => {
      const load = vi.fn<Loader>().mockReturnValue(new Promise<ContentDetail>(() => {}));
      const { unmount } = show({}, load);

      const signal = load.mock.calls[0][2];
      expect(load).toHaveBeenCalledWith(CONTENT, "admin", expect.any(AbortSignal));
      expect(signal?.aborted).toBe(false);

      unmount();

      expect(signal?.aborted).toBe(true);
    });

    it("does not load again when the parent re-renders with a new loader function", async () => {
      const first = vi.fn<Loader>().mockResolvedValue(detail());
      const second = vi.fn<Loader>().mockResolvedValue(detail({ name: "Lain" }));
      const { rerender } = show({}, first);
      await screen.findByRole("dialog", { name: "Promo Lebaran" });

      rerender(
        <ContentDetailPanel contentId={CONTENT} role="admin" onClose={() => {}} load={second} now={NOW} />,
      );

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Promo Lebaran" })).toBeInTheDocument();
    });
  });
});

describe("the creator's link numbers (PBI-27, 27.6)", () => {
  /** A link whose platform still reads it fails, where an admin may type the numbers (AC 14). */
  function link(state: "synced" | "sync_failed") {
    return {
      platform: "instagram" as const,
      url: "https://instagram.com/p/x",
      submittedAt: "2026-10-18",
      performance: {
        views: 12400,
        likes: 900,
        comments: null,
        shares: null,
        state,
        lastSyncedAt: state === "synced" ? "2026-11-01T03:00:00.000Z" : null,
        manualAt: null,
      },
    };
  }

  it("shows a creator their own numbers read-only, with no sync and no manual input (AC 20)", async () => {
    open(detail({ status: "link_submitted", links: [link("sync_failed")] }), {
      role: "creator",
    });

    expect(await screen.findByText("12.400")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sinkronkan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Isi Manual" })).not.toBeInTheDocument();
  });

  it("offers an admin the same card's actions, so the withheld ones are real (AC 12, 14)", async () => {
    open(detail({ status: "link_submitted", links: [link("sync_failed")] }));

    expect(await screen.findByRole("button", { name: "Sinkronkan Sekarang" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi Manual" })).toBeInTheDocument();
  });

  it("reads a 403 as numbers that are not the creator's: the panel's failure, with a retry (AC 21)", async () => {
    open(Promise.reject(new ContentDetailError(403)), { role: "creator" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Detail konten gagal dimuat");
  });
});

describe("ContentDetailPanel unsent notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks before Escape throws away a typed revision note, and keeps it on Lanjut mengisi", async () => {
    const { onClose } = open(detail());
    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    const box = await typeNote("Audio terlalu pelan.");

    fireEvent.keyDown(document, { key: "Escape" });

    const ask = await screen.findByRole("alertdialog", { name: "Buang catatan revisi?" });
    expect(ask).toHaveTextContent("Catatan dan gambar yang belum terkirim akan hilang.");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Lanjut mengisi" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(box).toHaveTextContent("Audio terlalu pelan.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the panel once the admin chooses Buang", async () => {
    const { onClose } = open(detail());
    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("Audio terlalu pelan.");

    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    fireEvent.click(await screen.findByRole("button", { name: "Buang" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes at once when the open note is still empty", async () => {
    const { onClose } = open(detail());
    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    await typeNote("   ");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks before throwing away a typed rejection reason too", async () => {
    const { onClose } = open(
      detail({
        status: "pending",
        waitingOn: "admin",
        latestSubmissionId: null,
        events: [
          {
            id: `${CONTENT}:scheduled`,
            type: "scheduled",
            at: "2026-09-01T03:00:00.000Z",
            actor: { name: "Rangga Pratama", role: "creator" },
          },
        ],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Tolak" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Alasan penolakan (opsional)" }), {
      target: { value: "Di luar brief." },
    });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(await screen.findByRole("alertdialog", { name: "Buang catatan revisi?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ContentDetailPanel revision notes (PBI-34)", () => {
  afterEach(cleanup);

  function revisionStep(payload: ContentDetail["events"][number]["payload"]) {
    return detail({
      events: [
        {
          id: "rev-1",
          type: "revision_requested",
          at: "2026-09-21T03:00:00.000Z",
          actor: { name: "dewi.admin@tofly.id", role: "admin" },
          payload,
        },
      ],
    });
  }

  it.each(["admin", "creator"] as const)(
    "shows the %s the formatted note with its thumbnails, opening one in an overlay (AC 8)",
    async (role) => {
      // Arrange
      open(
        revisionStep({
          note: "Perbaiki intro",
          noteHtml: "<p>Perbaiki <strong>intro</strong></p>",
          images: [{ id: "image-1", url: "/api/note-images/image-1", contentType: "image/png" }],
        }),
        { role },
      );

      // Act
      fireEvent.click(await screen.findByRole("button", { name: "Buka gambar 1" }));

      // Assert
      expect(screen.getByText("intro").tagName).toBe("STRONG");
      expect(screen.getByRole("dialog", { name: "Gambar 1 dari 1" })).toBeInTheDocument();
    },
  );

  it("closes only the overlay on Escape, leaving the panel open", async () => {
    // Arrange
    const { onClose } = open(
      revisionStep({
        note: "Lihat gambar",
        images: [{ id: "image-1", url: "/api/note-images/image-1", contentType: "image/png" }],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Buka gambar 1" }));

    // Act
    fireEvent.keyDown(document, { key: "Escape" });

    // Assert
    expect(screen.queryByRole("dialog", { name: "Gambar 1 dari 1" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes only the overlay on a press, leaving the panel open", async () => {
    // Arrange
    const { onClose } = open(
      revisionStep({
        note: "Lihat gambar",
        images: [{ id: "image-1", url: "/api/note-images/image-1", contentType: "image/png" }],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Buka gambar 1" }));
    const overlay = screen.getByRole("dialog", { name: "Gambar 1 dari 1" });

    // Act
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    // Assert
    expect(screen.queryByRole("dialog", { name: "Gambar 1 dari 1" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a note from before formatting exactly as it was (AC 9)", async () => {
    // Arrange
    open(revisionStep({ note: "Audio terlalu pelan.\nTambahkan subtitle." }));

    // Act
    const words = await screen.findByText(/Audio terlalu pelan/);

    // Assert
    expect(words.tagName).toBe("P");
    expect(words).toHaveClass("whitespace-pre-line");
    expect(screen.queryByRole("button", { name: /Buka gambar/ })).toBeNull();
  });
});

describe("ContentDetailPanel follow-up notes", () => {
  const EARLIER: FollowUp = {
    id: "f1",
    note: "Tambahan: logo di detik 3.",
    at: "2026-09-22T03:00:00.000Z",
    actor: { name: "Bastian" },
  };
  const SAVED: FollowUp = {
    id: "f2",
    note: "Ralat: pakai musik versi kedua.",
    at: "2026-09-22T05:00:00.000Z",
    actor: { name: "Bastian" },
  };

  // Round 2 is open: the admin sent it back and the creator has not answered yet.
  function round(overrides: Partial<ContentDetail> = {}): ContentDetail {
    return detail({
      status: "draft_revision",
      waitingOn: "creator",
      events: [
        {
          id: "fu-step",
          type: "revision_followup_added",
          at: EARLIER.at,
          actor: { name: "Bastian", role: "admin" },
        },
        {
          id: "rev-2",
          type: "revision_requested",
          at: "2026-09-21T10:00:00.000Z",
          actor: { name: "Bastian", role: "admin" },
          payload: { note: "Subtitle belum ada.", followUps: [EARLIER] },
        },
        {
          id: "sub-1",
          type: "draft_submitted",
          at: "2026-09-20T10:00:00.000Z",
          actor: { name: "Rangga Pratama", role: "creator" },
          payload: { version: 1, link: "https://drive.google.com/draft-v1" },
        },
        {
          id: "rev-1",
          type: "revision_requested",
          at: "2026-09-19T10:00:00.000Z",
          actor: { name: "Bastian", role: "admin" },
          payload: { note: "Audio terlalu pelan." },
        },
      ],
      ...overrides,
    });
  }

  async function latestRevisionItem() {
    const title = await screen.findByText("Revisi ke-2 diminta");
    return title.closest("li") as HTMLElement;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers Tambah Catatan Susulan under the latest revision note only, on Draft Perlu Revisi (AC 1)", async () => {
    open(round());

    const latest = await latestRevisionItem();
    expect(within(latest).getByRole("button", { name: "Tambah Catatan Susulan" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Tambah Catatan Susulan" })).toHaveLength(1);
  });

  it.each(["draft_review", "draft_approved", "link_submitted"] as const)(
    "offers no follow-up once the content is %s (AC 1, 3)",
    async (status) => {
      open(round({ status, waitingOn: status === "draft_review" ? "admin" : null }));

      await latestRevisionItem();
      expect(screen.queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull();
    },
  );

  it("offers no follow-up when there is no hand-in to add it to", async () => {
    open(round({ latestSubmissionId: null }));

    await latestRevisionItem();
    expect(screen.queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull();
  });

  it("lists the round's earlier follow-ups under its note for the admin (AC 4)", async () => {
    open(round());

    const latest = await latestRevisionItem();
    const list = within(latest).getByRole("list", { name: "Catatan susulan" });
    expect(list).toHaveTextContent(EARLIER.note);
    expect(within(latest).getByText("Subtitle belum ada.")).toBeInTheDocument();
  });

  it("shows the creator the follow-ups under the original note, with no form to add one (AC 4)", async () => {
    open(round(), { role: "creator" });

    const latest = await latestRevisionItem();
    const list = within(latest).getByRole("list", { name: "Catatan susulan" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent(EARLIER.note);
    expect(within(latest).getByText("Subtitle belum ada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull();
  });

  it("keeps an older round's follow-ups under that round's note, for admin and creator", async () => {
    const older: FollowUp = { ...EARLIER, id: "f0", note: "Tambahan ronde pertama." };
    for (const role of ["admin", "creator"] as const) {
      open(
        round({
          events: round().events.map((event) =>
            event.id === "rev-1" ? { ...event, payload: { ...event.payload, followUps: [older] } } : event,
          ),
        }),
        { role },
      );

      const first = (await screen.findByText("Revisi ke-1 diminta")).closest("li") as HTMLElement;
      expect(within(first).getByRole("list", { name: "Catatan susulan" })).toHaveTextContent(older.note);
      // The form stays with the open round only.
      expect(within(first).queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull();
      cleanup();
    }
  });

  it("saves through the port, lists the new follow-up after the earlier one and keeps the panel open (AC 4)", async () => {
    const addFollowUp = vi.fn().mockResolvedValue(SAVED);
    const onDecided = vi.fn();
    const { load } = open(round(), { ports: { addFollowUp }, onDecided });
    // After saving, the panel reads the content again for the timeline step (AC 6).
    load.mockResolvedValueOnce(withFollowUp(round(), SAVED));

    const latest = await latestRevisionItem();
    fireEvent.click(within(latest).getByRole("button", { name: "Tambah Catatan Susulan" }));
    await typeNote(SAVED.note, "Catatan susulan");
    fireEvent.click(screen.getByRole("button", { name: "Kirim Catatan Susulan" }));

    await waitFor(() =>
      expect(
        within(within(latest).getByRole("list", { name: "Catatan susulan" })).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(2),
    );
    expect(addFollowUp).toHaveBeenCalledWith(SUBMISSION, `<p>${SAVED.note}</p>`);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const items = within(within(latest).getByRole("list", { name: "Catatan susulan" })).getAllByRole(
      "listitem",
    );
    expect(items[1]).toHaveTextContent(SAVED.note);
    expect(screen.getByRole("status")).toHaveTextContent("Catatan susulan terkirim ke kreator.");
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("shows why and reads the content again when the creator already sent a new draft (AC 3)", async () => {
    const addFollowUp = vi
      .fn()
      .mockRejectedValue(new DecisionError(409, "Creator sudah mengirim draft baru"));
    const { load } = open(round(), { ports: { addFollowUp } });
    // The first read already happened on open; the re-read finds the new draft.
    load.mockResolvedValueOnce(round({ status: "draft_review", waitingOn: "admin" }));

    fireEvent.click(await screen.findByRole("button", { name: "Tambah Catatan Susulan" }));
    await typeNote("Logo", "Catatan susulan");
    fireEvent.click(screen.getByRole("button", { name: "Kirim Catatan Susulan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Creator sudah mengirim draft baru");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull(),
    );
  });

  // The follow-up reads under the revision note it adds to, so it takes no step of its own.
  it("gives a follow-up no step of its own in the timeline", async () => {
    open(round());

    await screen.findByLabelText("Riwayat konten");
    expect(screen.queryByText("Catatan susulan ditambahkan")).toBeNull();
  });
});
