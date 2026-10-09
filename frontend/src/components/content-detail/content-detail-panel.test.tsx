import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContentDetailError, type ContentDetail } from "@/lib/content-detail";
import type { PanelActionPorts } from "@/lib/panel-actions";
import { ContentDetailPanel } from "./content-detail-panel";

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
    tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
    waitingOn: "admin",
    latestSubmissionId: SUBMISSION,
    creatorActions: [],
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
    onDecided: () => void;
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
    />,
  );

  return { load, onClose };
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
        tags: { overdue: true, lateSubmission: false, approvalBypassed: false },
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

  it("keeps Kirim disabled while the note is empty or only spaces, and opens it after real text", async () => {
    open(detail());

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    const kirim = screen.getByRole("button", { name: "Kirim Revisi" });
    const note = screen.getByRole("textbox");

    expect(kirim).toBeDisabled();

    fireEvent.change(note, { target: { value: "   " } });
    expect(kirim).toBeDisabled();

    fireEvent.change(note, { target: { value: "Audio terlalu pelan." } });
    expect(kirim).toBeEnabled();
  });

  it("sends the trimmed note and reports the decision upward", async () => {
    const revise = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    open(detail(), { ports: { revise }, onDecided });

    fireEvent.click(await screen.findByRole("button", { name: "Minta Revisi" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Audio terlalu pelan.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    await waitFor(() => {
      expect(revise).toHaveBeenCalledWith(SUBMISSION, "Audio terlalu pelan.");
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
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Audio terlalu pelan." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(
      await screen.findByText("Draft ini sudah tidak menunggu keputusan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Audio terlalu pelan.");
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
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
      }),
      { role: "creator", ports: { onCreatorAction } },
    );

    const button = await screen.findByRole("button", { name: "Submit Link (H-1)" });
    fireEvent.click(button);

    expect(onCreatorAction).toHaveBeenCalledWith("submit_video");
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

  it("reads any other failure as something to retry", async () => {
    open(Promise.reject(new ContentDetailError(500)));

    expect(
      await screen.findByText("Gagal memuat konten. Coba tutup dan buka lagi."),
    ).toBeInTheDocument();
  });

  it("lists the journey newest first with each draft's version", async () => {
    open(detail());

    const journey = await screen.findByLabelText("Riwayat konten");
    const entries = journey.querySelectorAll("li");

    expect(entries[0]).toHaveTextContent("Draft v2 dikirim");
    expect(entries[1]).toHaveTextContent("Ditambahkan Admin");
  });
});
