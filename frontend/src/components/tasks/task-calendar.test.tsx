import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MyTask } from "@/lib/my-tasks";
import { TaskCalendar } from "./task-calendar";

const TODAY = "2026-10-09";

function task(overrides: Partial<MyTask> = {}): MyTask {
  return {
    id: "content-1",
    name: "Tutorial Latihan Listening",
    type: "specific",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
    ...overrides,
  };
}

function renderCalendar(tasks: MyTask[] = [task()], today = TODAY) {
  const onOpen = vi.fn();
  const view = render(<TaskCalendar tasks={tasks} today={today} onOpen={onOpen} />);
  return { ...view, onOpen };
}

/** The cell of one calendar day. */
function day(container: HTMLElement, iso: string): HTMLElement {
  const cell = container.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  if (!cell) throw new Error(`no cell for ${iso}`);
  return cell;
}

describe("TaskCalendar", () => {
  it("opens on the month today falls in", () => {
    renderCalendar();

    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
  });

  it("heads the grid with the days of the week, Sunday first", () => {
    renderCalendar();

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Min",
      "Sen",
      "Sel",
      "Rab",
      "Kam",
      "Jum",
      "Sab",
    ]);
  });

  it("draws every day of the month, even when no task is due", () => {
    const { container } = renderCalendar([]);

    expect(container.querySelectorAll("[data-day]")).toHaveLength(31);
    expect(screen.queryByRole("button", { name: /·/ })).not.toBeInTheDocument();
  });

  it("puts a task's chip on its deadline day", () => {
    const { container } = renderCalendar();

    expect(
      within(day(container, "2026-10-12")).getByRole("button", {
        name: "Tutorial Latihan Listening · Scheduled",
      }),
    ).toHaveTextContent("Tutorial Latihan Listening");
    expect(within(day(container, "2026-10-13")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shortens an Evergreen chip but still names the content in full for a screen reader", () => {
    renderCalendar([task({ name: "Evg_10_RanggaPratama_12102026", type: "evergreen" })]);

    expect(
      screen.getByRole("button", { name: "Evg_10_RanggaPratama_12102026 · Scheduled" }),
    ).toHaveTextContent("Evergreen #10");
  });

  it("marks an overdue chip in front of its text", () => {
    renderCalendar([task({ deadline: "2026-10-05", tags: ["overdue"] })]);

    expect(screen.getByRole("button", { name: /Tutorial Latihan Listening/ })).toHaveTextContent(
      "! Tutorial Latihan Listening",
    );
  });

  it.each([
    ["scheduled", [], "todo"],
    ["draft_revision", [], "todo"],
    ["draft_approved", [], "todo"],
    ["draft_review", [], "wait"],
    ["link_submitted", [], "done"],
    ["scheduled", ["overdue"], "overdue"],
  ] as const)("colours a %s chip tagged %j as the %s group", (status, tags, group) => {
    renderCalendar([task({ status, tags: [...tags] })]);

    expect(screen.getByRole("button", { name: /Tutorial Latihan Listening/ })).toHaveAttribute(
      "data-group",
      group,
    );
  });

  it("puts several tasks due the same day in one cell, in the order given", () => {
    const { container } = renderCalendar([
      task({ id: "a", name: "Pertama" }),
      task({ id: "b", name: "Kedua" }),
    ]);

    expect(
      within(day(container, "2026-10-12"))
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Pertama", "Kedua"]);
  });

  it("asks to open the content a chip stands for", () => {
    const { onOpen } = renderCalendar([task({ id: "content-7" })]);

    fireEvent.click(screen.getByRole("button", { name: /Tutorial Latihan Listening/ }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("content-7");
  });

  it("marks today's cell, and only that one", () => {
    const { container } = renderCalendar();

    expect(day(container, TODAY)).toHaveAttribute("aria-current", "date");
    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  describe("month navigation", () => {
    const OCTOBER = task({ id: "oct", name: "Konten Oktober", deadline: "2026-10-12" });
    const NOVEMBER = task({ id: "nov", name: "Konten November", deadline: "2026-11-03" });
    const SEPTEMBER = task({ id: "sep", name: "Konten September", deadline: "2026-09-30" });

    it("moves to the next month, showing only that month's tasks", () => {
      renderCalendar([OCTOBER, NOVEMBER]);

      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));

      expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Konten November/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Konten Oktober/ })).not.toBeInTheDocument();
    });

    it("moves to the previous month", () => {
      renderCalendar([OCTOBER, SEPTEMBER]);

      fireEvent.click(screen.getByRole("button", { name: "Bulan Sebelumnya" }));

      expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Konten September/ })).toBeInTheDocument();
    });

    it("turns the year over after December and before January", () => {
      renderCalendar([], "2026-12-15");

      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
      expect(screen.getByRole("heading", { name: "Januari 2027" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Bulan Sebelumnya" }));
      expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeInTheDocument();
    });

    it("marks no day as today once another month is shown", () => {
      const { container } = renderCalendar();

      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));

      expect(container.querySelector('[aria-current="date"]')).not.toBeInTheDocument();
    });

    it("has nowhere to go back to while the current month is shown", () => {
      renderCalendar();

      expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
    });

    it("returns to the current month from any other", () => {
      renderCalendar();

      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
      expect(screen.getByRole("button", { name: "Hari Ini" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Hari Ini" }));

      expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
    });
  });

  it("explains its colours in a legend, in the order the groups are listed", () => {
    renderCalendar();

    const legend = screen.getByRole("list", { name: "Keterangan warna" });

    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Perlu Dikerjakan",
      "Menunggu Admin",
      "Selesai",
      "Overdue",
      "Hari Ini",
    ]);
  });
});
