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
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
    ...overrides,
  };
}

function rows() {
  // The first row is the header.
  return screen.getAllByRole("row").slice(1);
}

describe("MyTaskTable", () => {
  it("shows a row's tags as pills beside its status, apart from it, as the admin sees them", () => {
    render(
      <MyTaskTable
        tasks={[
          task({ id: "late", status: "link_submitted", tags: ["late_submission", "approval_bypassed"], actions: [] }),
          task({ id: "clean" }),
        ]}
        onAction={vi.fn()}
        onDetail={vi.fn()}
      />,
    );

    const [late, clean] = rows();
    const tags = within(late).getByRole("list", { name: "Tanda konten" });
    expect(within(tags).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Late Submission",
      "Approval di-bypass",
    ]);
    expect(within(late).getByText("Content Link Submitted")).toBeInTheDocument();
    expect(within(clean).queryByRole("list", { name: "Tanda konten" })).toBeNull();
  });

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

    it("makes the Deadline header a sort button once the page can sort, keeping its place", () => {
      const onSortToggle = vi.fn();
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} sort="asc" onSortToggle={onSortToggle} />);

      const header = screen.getAllByRole("columnheader")[1];
      expect(header).toHaveAttribute("aria-sort", "ascending");
      expect(header).toHaveAttribute("role", "columnheader");
      fireEvent.click(within(header).getByRole("button", { name: /Deadline/ }));

      expect(onSortToggle).toHaveBeenCalledTimes(1);
    });

    it("says which way the deadline runs when it runs furthest first", () => {
      render(<MyTaskTable tasks={[task()]} sort="desc" onSortToggle={vi.fn()} />);

      expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "descending");
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

      expect(rows().map((row) => within(row).getAllByRole("cell")[0].firstChild?.textContent)).toEqual([
        "Paling dekat",
        "Berikutnya",
        "Sudah dikirim",
      ]);
    });
  });

  describe("creator wording", () => {
    it("shows a draft handed in again as waiting for review, like a first one", () => {
      render(
        <MyTaskTable tasks={[task({ status: "draft_review", actions: [] })]} onAction={vi.fn()} />,
      );

      expect(within(rows()[0]).getByText("Draft Menunggu Review")).toBeInTheDocument();
      expect(screen.queryByText("Draft Revised")).not.toBeInTheDocument();
    });

    it("says what the empty list means when it is given a message", () => {
      render(
        <MyTaskTable tasks={[]} emptyMessage="Tidak ada tugas berstatus Draft Approved." />,
      );

      expect(screen.getByText("Tidak ada tugas berstatus Draft Approved.")).toBeInTheDocument();
    });
  });

  // Below the lg breakpoint each row stacks into a card: the header row is visually hidden, so
  // each cell names its own column, and explicit roles keep the table semantics that some
  // browsers drop once a table's display changes.
  describe("narrow screens", () => {
    it("keeps table semantics explicit on every part of the table", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(screen.getByRole("table")).toHaveAttribute("role", "table");
      for (const row of screen.getAllByRole("row")) {
        expect(row).toHaveAttribute("role", "row");
      }
      const [name, deadline, status, actions] = screen.getAllByRole("cell");
      for (const cell of [name, deadline, status]) {
        expect(cell).toHaveAttribute("role", "cell");
      }
      // The action cell names no role: its buttons already say which task they act on, and an
      // explicit role on a td reads as an interactive element given a non-interactive role.
      expect(actions).not.toHaveAttribute("role");
      for (const header of screen.getAllByRole("columnheader")) {
        expect(header).toHaveAttribute("role", "columnheader");
      }
    });

    it("labels the deadline and status cells with their column", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      const cells = within(rows()[0]).getAllByRole("cell");
      expect(cells.map((cell) => cell.dataset.label)).toEqual([
        undefined,
        "Deadline",
        "Status",
        undefined,
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

    it.each(["draft_review"] as const)(
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
      // Nothing to do reads as an empty cell: a dash beside every finished row was only noise.
      expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("");
    });

    // UAT: every status and every button looked the same. Each action now takes the tone of
    // the state it answers, so a revision request stands out from a fresh draft.
    it("marks Submit Link Video green, as the step after an approval", () => {
      render(
        <MyTaskTable
          tasks={[task({ status: "draft_approved", actions: ["submit_video"] })]}
          onAction={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /Submit Link Video/ })).toHaveClass("bg-green-wash");
    });

    it("marks Resubmit Draft amber, as work that came back", () => {
      render(
        <MyTaskTable
          tasks={[task({ status: "draft_revision", actions: ["resubmit_draft"] })]}
          onAction={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /Resubmit Draft/ })).toHaveClass("bg-amber-wash");
    });

    it.each([
      ["scheduled", "bg-rule"],
      ["draft_review", "bg-accent"],
      ["draft_revision", "bg-amber"],
      ["draft_approved", "bg-green"],
      ["link_submitted", "bg-green"],
    ] as const)("colours the %s status dot %s, beside its label", (status, dot) => {
      render(<MyTaskTable tasks={[task({ status, actions: [] })]} onAction={vi.fn()} />);

      const cell = within(rows()[0]).getAllByRole("cell")[2];
      expect(cell.querySelector(`.${dot}`)).not.toBeNull();
      expect(cell.textContent).not.toBe("");
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
      expect(screen.getByRole("button", { name: /Submit Link Video/ })).not.toHaveClass(
        "bg-green-wash",
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

    // What the Resubmit Draft modal (SCRUM-109) opens on, so it must reach the page as its own action.
    it("hands a resubmit to the page as resubmit_draft", () => {
      const onAction = vi.fn();
      const revision = task({ status: "draft_revision", actions: ["resubmit_draft"] });
      render(<MyTaskTable tasks={[revision]} onAction={onAction} />);

      fireEvent.click(screen.getByRole("button", { name: /Resubmit Draft/ }));

      expect(onAction).toHaveBeenCalledWith(revision, "resubmit_draft");
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

  describe("opening a task", () => {
    it("opens the detail from the content name itself, with no separate Detail button", () => {
      const onDetail = vi.fn();
      const target = task();
      render(<MyTaskTable tasks={[target]} onAction={vi.fn()} onDetail={onDetail} />);

      const [row] = rows();
      expect(within(row).queryByRole("button", { name: /^Detail/ })).not.toBeInTheDocument();
      const name = within(row).getByRole("button", { name: "Evg_1_RanggaPratama_12102026" });
      expect(name).toHaveAttribute("aria-haspopup", "dialog");
      fireEvent.click(name);

      expect(onDetail).toHaveBeenCalledWith(target);
    });

    // The row itself carries no click handler (a clickable row would be a non-interactive role
    // doing an interactive job); the name button is stretched over it instead, so a press
    // anywhere on the row is a press on a real button.
    it("stretches the name over the whole row, so a press anywhere on it opens the detail", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} onDetail={vi.fn()} />);

      const [row] = rows();
      expect(row).not.toHaveAttribute("onclick");
      expect(row.className).toContain("relative");
      expect(row.className).toContain("hover:bg-surface-2");
      const name = within(row).getByRole("button", { name: "Evg_1_RanggaPratama_12102026" });
      expect(name.className).toContain("after:absolute");
      expect(name.className).toContain("after:inset-0");
    });

    // The name reads as plain text: only the row says it can be pressed, and a keyboard focus
    // rings the whole row rather than the name.
    it("keeps the name looking like text, with the focus ring drawn around the row", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} onDetail={vi.fn()} />);

      const name = screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" });
      expect(name.className).not.toMatch(/hover:(underline|text-)/);
      expect(name.className).not.toContain("font-semibold");
      expect(name.className).toContain("focus-visible:after:outline-focus");
      expect(rows()[0].className).toContain("cursor-pointer");
    });

    it("lifts the actions above the stretched name, so pressing one runs only that action", () => {
      const onDetail = vi.fn();
      const onAction = vi.fn();
      render(<MyTaskTable tasks={[task()]} onAction={onAction} onDetail={onDetail} />);

      const action = screen.getByRole("button", { name: /^Submit Draft/ });
      expect(action.parentElement?.className).toContain("relative");
      expect(action.parentElement?.className).toContain("z-10");
      fireEvent.click(action);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onDetail).not.toHaveBeenCalled();
    });

    it("keeps the row plain when there is no detail to open", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(rows()[0].className).not.toContain("hover:bg-surface-2");
    });

    it("shows the name as plain text when there is no detail to open", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(screen.queryByRole("button", { name: "Evg_1_RanggaPratama_12102026" })).not.toBeInTheDocument();
      expect(screen.getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
    });
  });

  describe("without actions", () => {
    it("drops the Aksi column on a list that never has anything to do", () => {
      render(
        <MyTaskTable tasks={[task({ status: "link_submitted", actions: [] })]} onDetail={vi.fn()} hideActions />,
      );

      expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Nama Konten",
        "Deadline",
        "Status",
      ]);
      expect(within(rows()[0]).getAllByRole("cell")).toHaveLength(3);
    });
  });

  it("centres every cell's content vertically, so the text lines up with the buttons", () => {
    render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

    for (const cell of within(rows()[0]).getAllByRole("cell")) {
      expect(cell.className).toContain("align-middle");
      expect(cell.className).not.toContain("align-top");
    }
  });

  describe("type and fixed layout", () => {
    it.each([
      ["evergreen", "Evergreen"],
      ["specific", "Specific"],
    ] as const)("shows a %s task's type under its name, as quiet text", (type, label) => {
      render(<MyTaskTable tasks={[task({ type })]} onAction={vi.fn()} onDetail={vi.fn()} />);

      const nameCell = within(rows()[0]).getAllByRole("cell")[0];
      const typeLabel = within(nameCell).getByText(label);
      expect(typeLabel.className).toContain("text-muted");
      expect(typeLabel.className).toContain("text-xs");
    });

    // The prototype's columns hold their width whatever a page holds, so a tab or a page with
    // short names or no buttons does not reshuffle the table.
    it("fixes the column widths from lg up, whatever the rows hold", () => {
      render(<MyTaskTable tasks={[task()]} onAction={vi.fn()} />);

      expect(screen.getByRole("table").className).toContain("lg:table-fixed");
      const cols = document.querySelectorAll("colgroup col");
      expect([...cols].map((col) => col.className)).toEqual(["w-[30%]", "w-[13%]", "w-[29%]", "w-[28%]"]);
    });

    it("spreads the three columns over the width when there is no Aksi column", () => {
      render(<MyTaskTable tasks={[task({ status: "link_submitted", actions: [] })]} hideActions />);

      const cols = document.querySelectorAll("colgroup col");
      expect([...cols].map((col) => col.className)).toEqual(["w-[46%]", "w-[20%]", "w-[34%]"]);
    });

    it("gives every row the same height from lg up, buttons or none", () => {
      render(
        <MyTaskTable
          tasks={[task({ id: "a" }), task({ id: "b", status: "link_submitted", actions: [] })]}
          onAction={vi.fn()}
        />,
      );

      for (const row of rows()) {
        expect(row.className).toContain("lg:h-16");
      }
    });
  });
});
