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

/** The month grid alone: the list under it names the same tasks, for small screens. */
function grid() {
  return within(screen.getByRole("table"));
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
    expect(grid().queryByRole("button", { name: /·/ })).not.toBeInTheDocument();
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

    expect(grid().getByRole("button", { name: /Tutorial Latihan Listening/ })).toHaveTextContent(
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

    expect(grid().getByRole("button", { name: /Tutorial Latihan Listening/ })).toHaveAttribute(
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

    fireEvent.click(grid().getByRole("button", { name: /Tutorial Latihan Listening/ }));

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
      expect(grid().getByRole("button", { name: /Konten November/ })).toBeInTheDocument();
      expect(grid().queryByRole("button", { name: /Konten Oktober/ })).not.toBeInTheDocument();
    });

    it("moves to the previous month", () => {
      renderCalendar([OCTOBER, SEPTEMBER]);

      fireEvent.click(screen.getByRole("button", { name: "Bulan Sebelumnya" }));

      expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
      expect(grid().getByRole("button", { name: /Konten September/ })).toBeInTheDocument();
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

    // Client feedback C4: a deadline range picked on the table must still mean something on the
    // calendar, which used to open on today's month and look empty for a range elsewhere.
    it("opens on the month a chosen deadline range starts in, with Hari Ini a press away", () => {
      const onOpen = vi.fn();
      render(
        <TaskCalendar
          tasks={[OCTOBER, task({ id: "dec", name: "Konten Desember", deadline: "2026-12-05" })]}
          today={TODAY}
          opensOn="2026-12-03"
          onOpen={onOpen}
        />,
      );

      expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeInTheDocument();
      expect(grid().getByRole("button", { name: /Konten Desember/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Hari Ini" }));
      expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    });

    it("opens on today's month when the range names no day", () => {
      render(<TaskCalendar tasks={[OCTOBER]} today={TODAY} opensOn={null} onOpen={vi.fn()} />);

      expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
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

  describe("on small screens", () => {
    const FIRST = task({ id: "a", name: "Tutorial Latihan Listening", deadline: "2026-10-20" });
    const EARLIER = task({
      id: "b",
      name: "Evg_10_RanggaPratama_05102026",
      type: "evergreen",
      deadline: "2026-10-05",
      status: "draft_review",
    });
    const NOVEMBER = task({ id: "c", name: "Konten November", deadline: "2026-11-03" });

    function list() {
      return within(screen.getByRole("region", { name: "Task bulan ini" }));
    }

    it("lists the shown month's tasks under the grid, earliest deadline first", () => {
      renderCalendar([FIRST, EARLIER, NOVEMBER]);

      expect(
        list()
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringContaining("Evg_10_RanggaPratama_05102026"),
        expect.stringContaining("Tutorial Latihan Listening"),
      ]);
    });

    it("names each task in full with its deadline, where a chip has no room to", () => {
      renderCalendar([EARLIER]);

      const entry = list().getByRole("listitem");

      expect(entry).toHaveTextContent("Evg_10_RanggaPratama_05102026");
      expect(entry).not.toHaveTextContent("Evergreen #10");
      expect(entry).toHaveTextContent("5 Okt 2026");
    });

    it.each([
      ["scheduled", [], "Perlu Dikerjakan"],
      ["draft_review", [], "Menunggu Admin"],
      ["link_submitted", [], "Selesai"],
      ["scheduled", ["overdue"], "Overdue"],
    ] as const)("says a %s task tagged %j is %s", (status, tags, group) => {
      renderCalendar([task({ status, tags: [...tags] })]);

      expect(list().getByRole("listitem")).toHaveTextContent(group);
    });

    it("opens the content an entry stands for", () => {
      const { onOpen } = renderCalendar([task({ id: "content-9" })]);

      fireEvent.click(list().getByRole("button"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("content-9");
    });

    it("follows the month the calendar is turned to", () => {
      renderCalendar([FIRST, NOVEMBER]);

      fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));

      expect(
        list()
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([expect.stringContaining("Konten November")]);
    });

    it("says so when the shown month has no task, instead of an empty list", () => {
      renderCalendar([NOVEMBER]);

      expect(list().getByText("Tidak ada task di bulan ini.")).toBeInTheDocument();
      expect(list().queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("is drawn for small screens only: wider ones read the chips", () => {
      renderCalendar();

      expect(screen.getByRole("region", { name: "Task bulan ini" })).toHaveClass("sm:hidden");
    });

    it("shrinks a chip to a dot, keeping its name for a screen reader", () => {
      renderCalendar();

      const chip = grid().getByRole("button", { name: "Tutorial Latihan Listening · Scheduled" });

      expect(within(chip).getByText("Tutorial Latihan Listening")).toHaveClass(
        "sr-only",
        "sm:not-sr-only",
      );
      expect(chip.querySelector('[aria-hidden="true"]')).toHaveClass("sm:hidden");
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
