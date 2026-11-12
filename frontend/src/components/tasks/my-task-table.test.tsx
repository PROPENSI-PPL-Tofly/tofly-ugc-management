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
    revisionNotesUpdatedAt: null,
    platforms: [],
    ...overrides,
  };
}

function rows() {
  // The first row is the header.
  return screen.getAllByRole("row").slice(1);
}

function renderTable(tasks: MyTask[] = [task()], extra: Partial<Parameters<typeof MyTaskTable>[0]> = {}) {
  const onDetail = vi.fn();
  render(<MyTaskTable tasks={tasks} onDetail={onDetail} {...extra} />);
  return { onDetail };
}

// Task Saya's table is laid out as the admin's Content Plan: the same columns minus the creator,
// the same red deadline and badges, and no buttons on the rows. A row opens Detail Konten, where
// the creator's hand-ins are.
describe("MyTaskTable", () => {
  describe("columns", () => {
    it("names the table for screen readers", () => {
      renderTable();

      expect(screen.getByRole("table", { name: "Daftar Tugas Saya" })).toBeInTheDocument();
    });

    it("heads the columns as the Content Plan does, without the creator and with no Aksi", () => {
      renderTable();

      expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Nama Konten",
        "Tipe",
        "Deadline",
        "Status",
        "Platform",
      ]);
    });

    it("gives the type a badge column beside the name", () => {
      renderTable([task({ type: "specific" })]);

      const type = within(rows()[0]).getAllByRole("cell")[1];
      expect(within(type).getByText("Specific")).toHaveClass("rounded-full", "bg-accent-wash");
    });

    it("shows each task's name, deadline the Indonesian way, and status label", () => {
      renderTable();

      const [row] = rows();
      expect(within(row).getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
      expect(within(row).getByText("12 Okt 2026")).toBeInTheDocument();
      expect(within(row).getByText("Scheduled")).toBeInTheDocument();
    });

    it("keeps the order the API sent, which is already nearest deadline first", () => {
      renderTable([
        task({ id: "a", name: "Paling dekat", deadline: "2026-10-01" }),
        task({ id: "b", name: "Berikutnya", deadline: "2026-10-08" }),
        task({ id: "c", name: "Sudah dikirim", deadline: "2026-09-20", status: "link_submitted", actions: [] }),
      ]);

      expect(rows().map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
        "Paling dekat",
        "Berikutnya",
        "Sudah dikirim",
      ]);
    });

    it("makes the Deadline header a sort button once the page can sort, keeping its place", () => {
      const onSortToggle = vi.fn();
      renderTable([task()], { sort: "asc", onSortToggle });

      const header = screen.getAllByRole("columnheader")[2];
      expect(header).toHaveAttribute("aria-sort", "ascending");
      fireEvent.click(within(header).getByRole("button", { name: /Deadline/ }));

      expect(onSortToggle).toHaveBeenCalledTimes(1);
    });

    it("says which way the deadline runs when it runs furthest first", () => {
      renderTable([task()], { sort: "desc", onSortToggle: vi.fn() });

      expect(screen.getAllByRole("columnheader")[2]).toHaveAttribute("aria-sort", "descending");
    });
  });

  describe("what a row shows", () => {
    it("shows the marks of the platforms the content was posted to in a column of their own (AC 13)", () => {
      renderTable([task({ platforms: ["instagram", "tiktok"] })]);

      const cell = within(rows()[0]).getAllByRole("cell")[4];
      expect(within(cell).getByLabelText(/instagram/i)).toBeInTheDocument();
      expect(within(cell).getByLabelText(/tiktok/i)).toBeInTheDocument();
    });

    it("shows no marks for a task with no link sent yet", () => {
      renderTable();

      expect(within(rows()[0]).getAllByRole("cell")[4]).toBeEmptyDOMElement();
    });

    it("reds a missed deadline instead of a badge, keeping the other tags beside the status", () => {
      renderTable([
        task({ id: "late", status: "link_submitted", tags: ["overdue", "approval_bypassed"], actions: [] }),
        task({ id: "clean" }),
      ]);

      const [late, clean] = rows();
      expect(within(late).getByText("12 Okt 2026")).toHaveClass("text-red-ink");
      const tags = within(late).getByRole("list", { name: "Tanda konten" });
      expect(within(tags).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Approval di-bypass"]);
      expect(within(late).getByText("Content Link Submitted")).toBeInTheDocument();
      expect(within(clean).queryByRole("list", { name: "Tanda konten" })).toBeNull();
      expect(within(clean).getByText("12 Okt 2026")).not.toHaveClass("text-red-ink");
    });

    it("shows a draft handed in again as waiting for review, like a first one", () => {
      renderTable([task({ status: "draft_review", actions: [] })]);

      expect(within(rows()[0]).getByText("Draft Menunggu Review")).toBeInTheDocument();
    });

    it("says when the admin last added a follow-up note, under the name (PBI-33 AC 5)", () => {
      const AT = "2026-11-09T07:00:00.000Z";
      renderTable([task({ status: "draft_revision", revisionNotes: "Hook kurang kuat.", revisionNotesUpdatedAt: AT })]);

      const line = screen.getByText(/^Catatan diperbarui/);
      expect(line).toHaveTextContent("Catatan diperbarui 9 Nov 2026, 14.00 WIB");
      expect(within(line).getByText("9 Nov 2026, 14.00 WIB").closest("time")).toHaveAttribute("dateTime", AT);
      expect(line).toHaveClass("text-xs", "text-muted");
    });

    it("says nothing about follow-ups on a row without one", () => {
      renderTable([task({ status: "draft_revision", revisionNotesUpdatedAt: null })]);

      expect(screen.queryByText(/Catatan diperbarui/)).toBeNull();
    });

    it("has no buttons but the name, whatever the status asks of the creator", () => {
      renderTable([
        task({ id: "a" }),
        task({ id: "b", status: "draft_revision", actions: ["resubmit_draft"] }),
        task({ id: "c", status: "draft_approved", actions: ["submit_video"] }),
      ]);

      expect(screen.queryByRole("button", { name: /^(Submit|Resubmit|Detail)/ })).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(3);
    });
  });

  describe("empty list", () => {
    it("says so when the creator has no tasks", () => {
      renderTable([]);

      expect(screen.getByText("Belum ada tugas untuk kamu.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("says what the empty list means when it is given a message", () => {
      renderTable([], { emptyMessage: "Tidak ada tugas berstatus Draft Approved." });

      expect(screen.getByText("Tidak ada tugas berstatus Draft Approved.")).toBeInTheDocument();
    });

    it("offers the empty list's action instead of the hint, which the action already explains", () => {
      renderTable([], {
        emptyMessage: "Tidak ada tugas yang cocok.",
        emptyAction: <button type="button">Reset filter</button>,
      });

      expect(screen.getByRole("button", { name: "Reset filter" })).toBeInTheDocument();
      expect(screen.queryByText("Tugas baru muncul di sini begitu admin menjadwalkannya.")).toBeNull();
    });
  });

  describe("opening a task", () => {
    it("opens the detail from the content name, a real button for the keyboard", () => {
      const target = task();
      const { onDetail } = renderTable([target]);

      const name = within(rows()[0]).getByRole("button", { name: "Evg_1_RanggaPratama_12102026" });
      expect(name).toHaveAttribute("aria-haspopup", "dialog");
      fireEvent.click(name);

      expect(onDetail).toHaveBeenCalledExactlyOnceWith(target);
    });

    it("opens the detail from a press anywhere on the row, once", () => {
      const target = task();
      const { onDetail } = renderTable([target]);

      fireEvent.click(within(rows()[0]).getByText("12 Okt 2026"));

      expect(onDetail).toHaveBeenCalledExactlyOnceWith(target);
    });

    it("opens the row that was pressed, among several", () => {
      const second = task({ id: "content-2", name: "Unboxing Paket" });
      const { onDetail } = renderTable([task(), second]);

      fireEvent.click(screen.getByText("Unboxing Paket"));

      expect(onDetail).toHaveBeenCalledExactlyOnceWith(second);
    });

    it("does not open when the press ends a text selection", () => {
      vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Evg_1" } as Selection);
      const { onDetail } = renderTable();

      fireEvent.click(rows()[0]);

      expect(onDetail).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it("marks the row as pressable", () => {
      renderTable();

      expect(rows()[0]).toHaveClass("cursor-pointer", "hover:bg-surface-2");
    });
  });

  // Below the lg breakpoint each row stacks into a card: the header row is visually hidden, so
  // each cell names its own column, and explicit roles keep the table semantics that some
  // browsers drop once a table's display changes.
  describe("narrow screens", () => {
    it("keeps table semantics explicit on every part of the table", () => {
      renderTable();

      expect(screen.getByRole("table")).toHaveAttribute("role", "table");
      for (const row of screen.getAllByRole("row")) {
        expect(row).toHaveAttribute("role", "row");
      }
      for (const group of screen.getAllByRole("rowgroup")) {
        expect(group).toHaveAttribute("role", "rowgroup");
      }
      for (const header of screen.getAllByRole("columnheader")) {
        expect(header).toHaveAttribute("role", "columnheader");
      }
      expect(within(rows()[0]).getAllByRole("cell")).toHaveLength(5);
    });

    it("sets each task apart as its own card below lg, with room between cards", () => {
      renderTable([task(), task({ id: "content-2" })]);

      const body = screen.getAllByRole("rowgroup")[1];
      expect(body).toHaveClass("max-lg:flex", "max-lg:flex-col", "max-lg:gap-3");
      for (const row of rows()) {
        expect(row).toHaveClass("max-lg:rounded-(--radius-panel)", "max-lg:border", "max-lg:bg-surface");
        expect(row).toHaveClass("border-b");
      }
    });

    // Below lg the board offers its own visible sort button; the header's stayed focusable while
    // unseen inside the hidden header row, so phones had two sort controls, one invisible.
    it("removes the header's sort button below lg, keeping the column's name", () => {
      renderTable([task()], { onSortToggle: vi.fn() });

      const header = screen.getByRole("columnheader", { name: /Deadline/ });
      expect(within(header).getByRole("button")).toHaveClass("max-lg:hidden");
      expect(within(header).getByText("Deadline", { selector: "span" })).toHaveClass("lg:hidden");
    });

    it("labels every cell but the name with its column", () => {
      renderTable();

      const cells = within(rows()[0]).getAllByRole("cell");
      expect(cells.map((cell) => cell.dataset.label)).toEqual([
        undefined,
        "Tipe",
        "Deadline",
        "Status",
        "Platform",
      ]);
    });
  });

  // At 1024px the table scrolled sideways with nothing to say more columns sat past the edge;
  // it sits in the frame that fades that edge (as every list table does).
  it("sits in a frame that fades the edge hiding more columns", () => {
    renderTable();

    expect(screen.getByRole("table").closest("[data-scroll-frame]")).not.toBeNull();
  });
});
