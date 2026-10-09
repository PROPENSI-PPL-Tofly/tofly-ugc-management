import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MyTask } from "@/lib/my-tasks";
import { MyTaskBoard } from "./my-task-board";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { fetchContentDetail } = vi.hoisted(() => ({
  fetchContentDetail: vi.fn(),
}));

vi.mock("@/lib/content-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-detail")>()),
  fetchContentDetail: (id: string, role: "admin" | "creator") =>
    fetchContentDetail(id, role),
}));

// The modals are stubbed: what they do inside is their own tests' business. These stand-ins
// show what the board handed them and expose the two ways a modal hands control back.
interface StubProps {
  content: {
    id: string;
    name: string;
    deadline: string;
    brief?: string;
    revisionNotes?: string | null;
  };
  onClose: () => void;
  onSubmitted: () => void;
  action?: string;
}

function StubModal({ label, props }: Readonly<{ label: string; props: StubProps }>) {
  return (
    <div role="dialog" aria-label={label}>
      <p>{`${props.content.id}|${props.content.name}|${props.content.deadline}`}</p>
      <p>{`action:${props.action ?? "-"}`}</p>
      <p>{`brief:${props.content.brief ?? "-"}|notes:${props.content.revisionNotes ?? "-"}`}</p>
      <button
        type="button"
        onClick={() => {
          props.onSubmitted();
          props.onClose();
        }}
      >
        stub-submitted
      </button>
      <button type="button" onClick={props.onClose}>
        stub-cancel
      </button>
    </div>
  );
}

vi.mock("@/components/my-task/submit-draft-modal", () => ({
  SubmitDraftModal: (props: StubProps) => <StubModal label="draft-modal" props={props} />,
}));

vi.mock("@/components/my-task/submit-video-modal", () => ({
  SubmitVideoModal: (props: StubProps) => <StubModal label="video-modal" props={props} />,
}));

function task(overrides: Partial<MyTask> = {}): MyTask {
  return {
    id: "content-1",
    name: "Evg_1_RanggaPratama_12102026",
    type: "evergreen",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    actions: ["submit_draft"],
    revisionNotes: null,
    ...overrides,
  };
}

describe("MyTaskBoard", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("lets the creator press the actions the table shows", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    expect(screen.getByRole("button", { name: /Submit Draft/ })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the draft modal on the task picked for Submit Draft", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    const modal = screen.getByRole("dialog", { name: "draft-modal" });
    expect(modal).toHaveTextContent("content-1|Evg_1_RanggaPratama_12102026|2026-10-12");
    expect(modal).toHaveTextContent("action:submit_draft");
  });

  it("opens the same draft modal as a resubmit for Resubmit Draft", () => {
    render(
      <MyTaskBoard tasks={[task({ status: "draft_revision", actions: ["resubmit_draft"] })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resubmit Draft/ }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "action:resubmit_draft",
    );
  });

  it("opens the video modal for Submit Link Video, and only that one", () => {
    render(
      <MyTaskBoard tasks={[task({ status: "draft_approved", actions: ["submit_video"] })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Submit Link Video/ }));

    expect(screen.getByRole("dialog", { name: "video-modal" })).toHaveTextContent(
      "content-1|Evg_1_RanggaPratama_12102026|2026-10-12",
    );
    expect(screen.queryByRole("dialog", { name: "draft-modal" })).not.toBeInTheDocument();
  });

  it("opens the modal for the row that was pressed", () => {
    render(
      <MyTaskBoard
        tasks={[
          task({ id: "a", name: "Pertama" }),
          task({ id: "b", name: "Kedua", deadline: "2026-10-20" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit Draft: Kedua" }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "b|Kedua|2026-10-20",
    );
  });

  // After a hand-in the row's status and buttons change on the server; refreshing re-runs the
  // page's fetch so the table shows them, and the pressed button is gone.
  it("refreshes the list and closes after a successful hand-in", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hands the modals the brief and the admin's revision notes", () => {
    render(
      <MyTaskBoard
        tasks={[
          task({
            status: "draft_revision",
            actions: ["resubmit_draft"],
            brief: "Tunjukkan kemasan",
            revisionNotes: "Perjelas intro",
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resubmit Draft/ }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "brief:Tunjukkan kemasan|notes:Perjelas intro",
    );
  });

  it.each<[string, Partial<MyTask>, string]>([
    ["Submit Draft", {}, "Draft terkirim. Admin akan meninjaunya."],
    [
      "Resubmit Draft",
      { status: "draft_revision", actions: ["resubmit_draft"] },
      "Draft terkirim. Admin akan meninjaunya.",
    ],
    [
      "Submit Link Video",
      { status: "draft_approved", actions: ["submit_video"] },
      "Link video terkirim. Konten ini selesai.",
    ],
  ])("confirms a %s hand-in with a toast", (label, overrides, message) => {
    render(<MyTaskBoard tasks={[task(overrides)]} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("puts focus on the task list after a hand-in, since the pressed button may be gone", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(screen.getByRole("region", { name: "Daftar Tugas Saya" })).toHaveFocus();
  });

  it("shows no toast when the creator cancels", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-cancel" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets the creator dismiss the toast", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    fireEvent.click(screen.getByRole("button", { name: "Tutup notifikasi" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("closes without refreshing when the creator cancels", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-cancel" }));

    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so when there are no tasks", () => {
    render(<MyTaskBoard tasks={[]} />);

    expect(screen.getByText("Belum ada tugas untuk kamu.")).toBeInTheDocument();
  });
});

describe("MyTaskBoard content detail panel", () => {
  beforeEach(() => {
    refresh.mockClear();
    fetchContentDetail.mockReset();
    window.history.pushState({}, "", "/creator/tasks");
  });

  function panelDetail() {
    return {
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen" as const,
      brief: "",
      deadline: "2026-10-12",
      status: "draft_review" as const,
      creatorName: "Rangga Pratama",
      tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
      waitingOn: "creator" as const,
      latestSubmissionId: null,
      creatorActions: ["submit_video"] as const,
      events: [],
    };
  }

  it("opens the content detail panel from a row, as the creator", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: /detail:/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "creator");
  });

  it("hands the panel's submit action back to the row's submit modal", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: /detail:/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    expect(await screen.findByRole("dialog", { name: "video-modal" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Detail Konten|Evg_1/ })).toBeNull();
  });

  it("opens the panel straight from a ?content= link, the way a notification would", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-1");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "creator");
  });

  it("closes the panel from Tutup without opening any modal", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: /detail:/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the panel without a modal when the link points at a task the list does not hold", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-404");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
