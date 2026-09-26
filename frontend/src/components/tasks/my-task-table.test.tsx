import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MyTask } from "@/lib/my-tasks";
import { MyTaskTable } from "./my-task-table";

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

function rows() {
  // The first row is the header.
  return screen.getAllByRole("row").slice(1);
}

describe("MyTaskTable", () => {
  describe("columns", () => {
    it("names the table for screen readers", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(screen.getByRole("table", { name: "Daftar Tugas Saya" })).toBeInTheDocument();
    });

    it("heads the columns Nama Konten, Deadline, Status, and Aksi", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Nama Konten",
        "Deadline",
        "Status",
        "Aksi",
      ]);
    });

    it("shows each task's name, deadline the Indonesian way, and status label", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      const [row] = rows();
      expect(within(row).getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
      expect(within(row).getByText("12 Okt 2026")).toBeInTheDocument();
      expect(within(row).getByText("Scheduled")).toBeInTheDocument();
    });

    it("keeps the order the API sent, which is already nearest deadline first", () => {
      render(
        <MyTaskTable
          tasks={[
            task({ id: "a", name: "Paling dekat", deadline: "2026-10-01" }),
            task({ id: "b", name: "Berikutnya", deadline: "2026-10-08" }),
            task({ id: "c", name: "Sudah dikirim", deadline: "2026-09-20", status: "link_submitted", actions: [] }),
          ]}
          onAction={vi.fn()}
        />,
      );

      expect(rows().map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
        "Paling dekat",
        "Berikutnya",
        "Sudah dikirim",
      ]);
    });
  });

  // One button set per status (Sprint PRD PBI-20 AC); which ones is the API's call.
  describe("action per status", () => {
    it.each([
      ["scheduled", ["submit_draft"], ["Submit Draft"]],
      ["draft_revision", ["resubmit_draft"], ["Resubmit Draft"]],
      ["draft_approved", ["submit_video"], ["Submit Link Video"]],
      ["scheduled", ["submit_draft", "submit_video"], ["Submit Draft", "Submit Link Video"]],
    ] as const)("offers %s with %j as %j", (status, actions, labels) => {
      render(
        <MyTaskTable tasks={[task({ status, actions: [...actions] })]} onAction={vi.fn()} />,
      );

      const [row] = rows();
      expect(within(row).getAllByRole("button").map((button) => button.textContent)).toEqual(
        labels,
      );
    });

    it("names each button after its task, since every row has the same labels", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(
        screen.getByRole("button", { name: "Submit Draft: Evg_1_RanggaPratama_12102026" }),
      ).toBeInTheDocument();
    });

    it.each(["draft_review", "draft_revised"] as const)(
      "says a %s task is waiting for the admin instead of offering a button",
      (status) => {
        render(<MyTaskTable tasks={[task({ status, actions: [] })]} onAction={vi.fn()} />);

        const [row] = rows();
        expect(within(row).queryByRole("button")).not.toBeInTheDocument();
        expect(within(row).getByText("Menunggu review admin")).toBeInTheDocument();
      },
    );

    it("offers nothing for a finished task", () => {
      render(
        <MyTaskTable tasks={[task({ status: "link_submitted", actions: [] })]} onAction={vi.fn()} />,
      );

      const [row] = rows();
      expect(within(row).queryByRole("button")).not.toBeInTheDocument();
      expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("—");
    });

    it("marks Submit Link Video as the next step once the draft is approved", () => {
      render(
        <MyTaskTable
          tasks={[task({ status: "draft_approved", actions: ["submit_video"] })]}
          onAction={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /Submit Link Video/ })).toHaveClass("bg-accent");
    });

    // Inside H-1 without an approved draft the link skips the approval: allowed, but not the
    // path the creator should take by default, so it does not look like the main action.
    it("keeps an H-1 Submit Link Video secondary while a draft is still due", () => {
      render(
        <MyTaskTable
          tasks={[task({ status: "scheduled", actions: ["submit_draft", "submit_video"] })]}
          onAction={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /Submit Draft/ })).toHaveClass("bg-accent");
      expect(screen.getByRole("button", { name: /Submit Link Video/ })).not.toHaveClass(
        "bg-accent",
      );
    });
  });

  describe("clicking an action", () => {
    it("hands the task and the action to the page", () => {
      const onAction = vi.fn();
      const scheduled = task();
      render(<MyTaskTable tasks={[scheduled]} onAction={onAction} />);

      fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

      expect(onAction).toHaveBeenCalledWith(scheduled, "submit_draft");
    });

    it("tells apart two actions on the same row", () => {
      const onAction = vi.fn();
      const both = task({ actions: ["submit_draft", "submit_video"] });
      render(<MyTaskTable tasks={[both]} onAction={onAction} />);

      fireEvent.click(screen.getByRole("button", { name: /Submit Link Video/ }));

      expect(onAction).toHaveBeenCalledWith(both, "submit_video");
    });

    // Until the Submit Draft / Submit Link Video modals (SCRUM-109, SCRUM-132) are wired in,
    // a button with nowhere to go is shown but cannot be pressed.
    it("disables the buttons when there is nothing to open yet", () => {
      render(<MyTaskTable tasks={[task()]} />);

      expect(screen.getByRole("button", { name: /Submit Draft/ })).toBeDisabled();
    });
  });

  it("says so when the creator has no tasks", () => {
    render(<MyTaskTable tasks={[]} onAction={vi.fn()} />);

    expect(screen.getByText("Belum ada tugas untuk kamu.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
