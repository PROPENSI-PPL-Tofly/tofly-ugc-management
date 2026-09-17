import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskTable } from "./task-table";
import { myTask } from "./task.fixture";

function row(name: string) {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("TaskTable", () => {
  it("shows the three PRD columns", () => {
    render(<TaskTable tasks={[myTask()]} />);

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Nama Konten", "Deadline", "Status", "Aksi"]);
  });

  it("keeps rows in the order the API sorted them", () => {
    render(
      <TaskTable
        tasks={[
          myTask({ id: "a", name: "Paling dekat", deadline: "2026-09-18" }),
          myTask({ id: "b", name: "Lebih jauh", deadline: "2026-10-20" }),
        ]}
      />,
    );

    const names = screen.getAllByRole("row").slice(1).map((tr) => within(tr).getAllByRole("cell")[0].textContent);
    expect(names[0]).toContain("Paling dekat");
    expect(names[1]).toContain("Lebih jauh");
  });

  it("lets scheduled content submit a draft but not a video yet", () => {
    render(<TaskTable tasks={[myTask()]} />);

    const tr = row("Evergreen - Review Fitur Tobi AI");
    expect(within(tr).getByRole("button", { name: "Submit Draft" })).toBeEnabled();
    expect(within(tr).getByRole("button", { name: "Submit Link Video" })).toBeDisabled();
    expect(within(tr).getByText("Scheduled")).toBeInTheDocument();
    expect(within(tr).getByText("H-14")).toBeInTheDocument();
  });

  it("relabels the draft action for content sent back for revision", () => {
    render(
      <TaskTable
        tasks={[
          myTask({
            status: "draft_revision",
            actions: { canSubmitDraft: true, isResubmission: true, canSubmitVideo: false, inGracePeriod: false },
          }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Resubmit Draft" })).toBeEnabled();
    expect(screen.getByText("Draft Waiting for Revision")).toBeInTheDocument();
  });

  it("closes the draft action while a draft waits for review", () => {
    render(
      <TaskTable
        tasks={[
          myTask({
            status: "draft_review",
            actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: false, inGracePeriod: false },
          }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Submit Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit Link Video" })).toBeDisabled();
  });

  it("opens the video action for an approved draft", () => {
    render(
      <TaskTable
        tasks={[
          myTask({
            status: "draft_approved",
            actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: false },
          }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Submit Link Video" })).toBeEnabled();
    expect(screen.getByText("Draft Approved")).toBeInTheDocument();
  });

  it("flags the H-1 grace window and an overdue deadline", () => {
    render(
      <TaskTable
        tasks={[
          myTask({
            status: "draft_review",
            daysUntilDeadline: -1,
            actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: true },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Masa tenggang H-1")).toBeInTheDocument();
    expect(screen.getByText("Lewat 1 hari")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Link Video" })).toBeEnabled();
  });

  it("stops counting down once the link is in", () => {
    render(
      <TaskTable
        tasks={[
          myTask({
            status: "link_submitted",
            daysUntilDeadline: -3,
            actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: false, inGracePeriod: false },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Content Link Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Lewat 3 hari")).not.toBeInTheDocument();
  });

  it("hands the clicked task to the matching handler", async () => {
    const onSubmitDraft = vi.fn();
    const onSubmitVideo = vi.fn();
    const task = myTask({
      actions: { canSubmitDraft: true, isResubmission: false, canSubmitVideo: true, inGracePeriod: true },
    });
    render(<TaskTable tasks={[task]} onSubmitDraft={onSubmitDraft} onSubmitVideo={onSubmitVideo} />);

    await userEvent.click(screen.getByRole("button", { name: "Submit Draft" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit Link Video" }));

    expect(onSubmitDraft).toHaveBeenCalledWith(task);
    expect(onSubmitVideo).toHaveBeenCalledWith(task);
  });

  it("does nothing when no handler is wired yet", async () => {
    render(<TaskTable tasks={[myTask()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Submit Draft" }));

    expect(screen.getByRole("button", { name: "Submit Draft" })).toBeInTheDocument();
  });

  it("says so when nothing is assigned", () => {
    render(<TaskTable tasks={[]} />);

    expect(screen.getByText("Belum ada tugas")).toBeInTheDocument();
  });
});
