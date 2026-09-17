import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyTask } from "@/lib/tasks";
import { MyTaskBoard } from "./my-task-board";
import { myTask } from "./task.fixture";

const refresh = vi.fn();
const submitDraft = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks")>("@/lib/tasks");
  return { ...actual, submitDraft: (...args: unknown[]) => submitDraft(...args) };
});

const reviewed = myTask({
  status: "draft_review",
  actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: false, inGracePeriod: false },
});

async function submitDraftFor(name: string) {
  const row = screen.getByText(name).closest("tr") as HTMLElement;
  await userEvent.click(within(row).getByRole("button", { name: /Submit Draft/ }));
  await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
}

describe("MyTaskBoard", () => {
  beforeEach(() => {
    refresh.mockReset();
    submitDraft.mockReset();
  });

  it("opens the draft dialog for the clicked row and closes it again", async () => {
    render(<MyTaskBoard tasks={[myTask()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Submit Draft" }));
    expect(screen.getByRole("dialog", { name: "Submit Draft" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the dialog, confirms, and shows the new status immediately", async () => {
    submitDraft.mockResolvedValue(reviewed);
    render(<MyTaskBoard tasks={[myTask()]} />);

    await submitDraftFor("Evergreen - Review Fitur Tobi AI");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("berhasil dikirim dan menunggu review Admin");
    expect(screen.getByText("Draft Waiting for Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Draft" })).toBeDisabled();
    expect(refresh).toHaveBeenCalled();
  });

  it("lets the refreshed server list take over from the local update", async () => {
    submitDraft.mockResolvedValue(reviewed);
    const { rerender } = render(<MyTaskBoard tasks={[myTask()]} />);
    await submitDraftFor("Evergreen - Review Fitur Tobi AI");

    const fromServer: MyTask[] = [
      myTask({
        status: "draft_approved",
        actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: false },
      }),
    ];
    rerender(<MyTaskBoard tasks={fromServer} />);

    expect(screen.getByText("Draft Approved")).toBeInTheDocument();
  });
});
