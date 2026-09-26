import { fireEvent, render, screen } from "@testing-library/react";
import type { MyTask } from "@/lib/my-tasks";
import { MyTaskBoard } from "./my-task-board";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The modals are stubbed: what they do inside is their own tests' business. These stand-ins
// show what the board handed them and expose the two ways a modal hands control back.
interface StubProps {
  content: { id: string; name: string; deadline: string };
  onClose: () => void;
  onSubmitted: () => void;
  action?: string;
}

function StubModal({ label, props }: Readonly<{ label: string; props: StubProps }>) {
  return (
    <div role="dialog" aria-label={label}>
      <p>{`${props.content.id}|${props.content.name}|${props.content.deadline}`}</p>
      <p>{`action:${props.action ?? "-"}`}</p>
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
