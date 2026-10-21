import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_MY_TASKS_PARAMS, type MyTasksCounts, type MyTasksParams } from "@/lib/my-tasks";
import { MyTaskFilters } from "./my-task-filters";
import { MyTaskTabBar } from "./my-task-tab-bar";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/creator/tasks",
}));

const COUNTS: MyTasksCounts = { all: 5, action: 3, waiting: 1, done: 1 };

/** Renders the bar on an address, with the server's reading of it as the bar's state. */
function renderOn(query: Record<string, string> = {}, state: Partial<MyTasksParams> = {}) {
  searchParams = new URLSearchParams(query);
  return render(<MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, ...state }} counts={COUNTS} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MyTaskFilters", () => {
  it("offers the search, Tipe, Status, Overdue and Periode on Semua", () => {
    renderOn();

    expect(screen.getByRole("searchbox", { name: "Cari judul konten" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status:/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Overdue")).toBeInTheDocument();
    expect(screen.getByLabelText("Periode")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("offers every status a creator can see on Semua, never a pending proposal", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));

    for (const name of [
      "Semua",
      "Scheduled",
      "Draft Menunggu Review",
      "Draft Perlu Revisi",
      "Draft Approved",
      "Content Link Submitted",
    ]) {
      expect(screen.getByRole("checkbox", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.queryByRole("checkbox", { name: "Pending" })).not.toBeInTheDocument();
  });

  it("offers only what Perlu Dikerjakan can list on that tab, an H-1 draft in review included", () => {
    renderOn({ tab: "action" }, { tab: "action" });

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));

    expect(screen.getByRole("checkbox", { name: "Scheduled" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Perlu Revisi" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Approved" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Menunggu Review" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Content Link Submitted" })).not.toBeInTheDocument();
  });

  // One status is no choice: Menunggu Admin holds only drafts in review, Selesai only links.
  it.each(["waiting", "done"] as const)("hides the status filter on %s, where there is nothing to pick", (tab) => {
    renderOn({ tab }, { tab });
    expect(screen.queryByRole("button", { name: /^Status:/ })).not.toBeInTheDocument();
  });

  it("hides Overdue on Selesai, where nothing is waiting any more", () => {
    renderOn({ tab: "done" }, { tab: "done" });
    expect(screen.queryByLabelText("Overdue")).not.toBeInTheDocument();
  });

  it("sends the search once typing pauses, dropping the old page and keeping the tab", () => {
    renderOn({ tab: "action", page: "2" }, { tab: "action", page: 2 });

    fireEvent.change(screen.getByRole("searchbox", { name: "Cari judul konten" }), {
      target: { value: "serum" },
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledWith("/creator/tasks?tab=action&q=serum", { scroll: false });
  });

  // Client feedback C5: one type at a time reads plainer as a set of radio choices than as a
  // checklist behind a pill. The address keeps the values it always had.
  describe("Tipe, one choice at a time", () => {
    it("offers Semua and every type as radios in one named group, Semua chosen by default", () => {
      renderOn();

      const group = within(screen.getByRole("group", { name: "Tipe" }));
      const radios = group.getAllByRole("radio");
      expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
        "Semua",
        "Evergreen",
        "Specific",
      ]);
      expect(group.getByRole("radio", { name: "Semua" })).toBeChecked();
      // One name, so the arrow keys move between them and Tab stops on the group once.
      expect(new Set(radios.map((radio) => radio.getAttribute("name"))).size).toBe(1);
      expect(screen.queryByRole("button", { name: /^Tipe:/ })).not.toBeInTheDocument();
    });

    it.each([
      ["Evergreen", "evergreen"],
      ["Specific", "specific"],
    ])("puts %s in the address under the value it always had", (name, value) => {
      renderOn();

      fireEvent.click(screen.getByRole("radio", { name }));

      expect(replace).toHaveBeenLastCalledWith(`/creator/tasks?type=${value}`, { scroll: false });
    });

    it("shows the address's type as the chosen radio", () => {
      renderOn({ type: "specific" }, { type: ["specific"] });

      expect(screen.getByRole("radio", { name: "Specific" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Semua" })).not.toBeChecked();
    });

    it("goes back to every type with Semua, keeping the tab and the other filters", () => {
      renderOn({ tab: "waiting", type: "specific", overdue: "yes" }, { tab: "waiting", type: ["specific"] });

      fireEvent.click(screen.getByRole("radio", { name: "Semua" }));

      expect(replace).toHaveBeenLastCalledWith("/creator/tasks?tab=waiting&overdue=yes", { scroll: false });
    });

    it("moves from one type straight to the other, never to both", () => {
      renderOn({ type: "evergreen" }, { type: ["evergreen"] });

      fireEvent.click(screen.getByRole("radio", { name: "Specific" }));

      expect(replace).toHaveBeenLastCalledWith("/creator/tasks?type=specific", { scroll: false });
    });

    it("is cleared by Reset with everything else", () => {
      renderOn({ type: "evergreen", q: "serum" }, { type: ["evergreen"], q: "serum" });

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(replace).toHaveBeenLastCalledWith("/creator/tasks", { scroll: false });
    });
  });

  it("puts picked statuses in the address", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Draft Perlu Revisi" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?status=draft_revision", { scroll: false });
  });

  // A typed or stale address can name what the page does not hold. The list ignores it, so
  // the bar must not draw it as a pick either.
  it("shows no chip for a type or a status the address names but the filter does not offer", () => {
    renderOn(
      { type: "evergreen,foo", status: "pending, scheduled ,bogus" },
      { type: ["evergreen"], status: ["scheduled"] },
    );

    expect(screen.getByRole("radio", { name: "Evergreen" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Hapus filter/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Status:/ })).toHaveTextContent("Scheduled");
  });

  // Every type named is every type: the list shows all of them, so the choice reads Semua.
  it("reads an address naming every type, repeated or not, as Semua", () => {
    searchParams = new URLSearchParams("type=evergreen&type=specific");
    render(
      <MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, type: ["evergreen", "specific"] }} />,
    );

    expect(screen.getByRole("radio", { name: "Semua" })).toBeChecked();
    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
  });

  it("shows no chip for a status another tab holds", () => {
    renderOn({ tab: "action", status: "link_submitted,scheduled" }, { tab: "action", status: ["scheduled"] });

    expect(screen.getAllByRole("button", { name: /^Hapus filter Status/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" })).toBeInTheDocument();
  });

  it("leaves what it does not offer behind on the next pick", () => {
    renderOn({ status: "pending,scheduled,bogus" }, { status: ["scheduled"] });

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Draft Approved" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?status=scheduled%2Cdraft_approved", {
      scroll: false,
    });
  });

  it("still offers Reset when the address holds only values it does not offer, to clear them", () => {
    renderOn({ status: "bogus" });

    expect(screen.queryByRole("button", { name: /^Hapus filter/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks", { scroll: false });
  });

  it("narrows by overdue under the page's own word for it", () => {
    renderOn();

    fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "yes" } });

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?overdue=yes", { scroll: false });
  });

  it("picks a period, and the custom days once Pilih tanggal is chosen", () => {
    renderOn({ period: "custom" }, { period: "custom" });

    fireEvent.change(screen.getByLabelText("Deadline mulai"), { target: { value: "2026-10-01" } });

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?period=custom&from=2026-10-01", {
      scroll: false,
    });
  });

  // Like the period chip: both days go in one navigation, so no address with one day left on
  // it is ever opened. The range stays picked, and so do the tab and the other filters.
  it("clears both custom days in one navigation with Kosongkan tanggal", () => {
    renderOn(
      { tab: "waiting", type: "specific", period: "custom", from: "2026-10-01", to: "2026-10-31" },
      { tab: "waiting", period: "custom" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Kosongkan tanggal" }));

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/creator/tasks?tab=waiting&type=specific&period=custom",
      { scroll: false },
    );
  });

  it("says Perlu Dikerjakan ignores the period, since work to do never hides behind a date", () => {
    renderOn({ tab: "action", period: "month" }, { tab: "action", period: "month" });
    expect(screen.getByText("Periode tidak berlaku di tab ini")).toBeInTheDocument();
  });

  it("says nothing about the period on a tab it narrows", () => {
    renderOn({ tab: "waiting", period: "month" }, { tab: "waiting", period: "month" });
    expect(screen.queryByText("Periode tidak berlaku di tab ini")).not.toBeInTheDocument();
  });

  it("offers Reset once anything is narrowed, clearing everything but the tab", () => {
    renderOn(
      { tab: "action", q: "serum", type: "specific", overdue: "yes", sort: "desc" },
      { tab: "action", q: "serum", type: ["specific"], overdue: "yes", sort: "desc" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?tab=action", { scroll: false });
  });

  it("clears everything back to the bare address from Semua", () => {
    renderOn({ status: "scheduled" }, { status: ["scheduled"] });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks", { scroll: false });
  });

  it.each([
    ["a search", { q: "serum" }],
    ["a type", { type: "evergreen" }],
    ["an overdue filter", { overdue: "no" }],
    ["a period", { period: "last90" }],
  ])("offers Reset for %s", (_label, query) => {
    renderOn(query);
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  describe("on the calendar view", () => {
    /** Renders the bar above the calendar, whose view the address names. */
    function renderOnCalendar(
      query: Record<string, string> = {},
      state: Partial<MyTasksParams> = {},
    ) {
      searchParams = new URLSearchParams({ view: "calendar", ...query });
      return render(
        <MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, ...state }} view="calendar" counts={COUNTS} />,
      );
    }

    it("stays on the calendar when a filter is picked", () => {
      renderOnCalendar();

      fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "yes" } });

      expect(replace).toHaveBeenCalledExactlyOnceWith("/creator/tasks?view=calendar&overdue=yes", {
        scroll: false,
      });
    });

    it("stays on the calendar when a filter is taken off again", () => {
      renderOnCalendar({ overdue: "yes" }, { overdue: "yes" });

      fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "all" } });

      expect(replace).toHaveBeenCalledExactlyOnceWith("/creator/tasks?view=calendar", {
        scroll: false,
      });
    });

    it("stays on the calendar when the filters are reset", () => {
      renderOnCalendar({ overdue: "yes" }, { overdue: "yes" });

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(replace).toHaveBeenLastCalledWith("/creator/tasks?view=calendar", { scroll: false });
    });

    it("stays on the calendar and on its tab when the filters are reset", () => {
      renderOnCalendar({ tab: "waiting", type: "evergreen" }, { tab: "waiting", type: ["evergreen"] });

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(replace).toHaveBeenLastCalledWith("/creator/tasks?tab=waiting&view=calendar", {
        scroll: false,
      });
    });
  });

  it("keeps the table's address free of a view when it is told the view is the table", () => {
    searchParams = new URLSearchParams({ overdue: "yes" });
    render(<MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, overdue: "yes" }} view="table" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks", { scroll: false });
  });

  // The approved design folds the filters behind one Filter button on a phone, with no row of
  // chips: the button counts what is on, and the open controls show each choice themselves.
  describe("folded on a phone", () => {
    const NARROWED = {
      type: "evergreen",
      status: "scheduled,draft_revision",
      overdue: "yes",
      period: "custom",
      from: "2026-12-03",
      to: "2026-12-20",
    };

    it("counts every active filter, each pick on its own, and draws no chip row", () => {
      renderOn(NARROWED, { period: "custom" });

      expect(screen.getByRole("button", { name: "Filter, 5 aktif" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
    });

    // The approved design moves the tabs into the folded filters on a phone, as one choice.
    it("offers the tabs as one Tampilkan choice, each with its count", () => {
      renderOn({ tab: "waiting" }, { tab: "waiting" });

      expect(screen.getByRole("combobox", { name: "Tampilkan" })).toHaveValue("waiting");
      expect(
        Array.from(screen.getByRole("combobox", { name: "Tampilkan" }).querySelectorAll("option")).map(
          (option) => option.textContent,
        ),
      ).toEqual(["Semua (5)", "Perlu Dikerjakan (3)", "Menunggu Admin (1)", "Selesai (1)"]);
    });

    // Picking a tab in the filters must be the very same move as pressing it in the tab row:
    // one navigation, to the same address (the tab's contract applied, the view kept).
    it("picks a tab exactly as pressing it does: one navigation to the same address", () => {
      const query = { type: "specific", status: "scheduled", period: "month", view: "calendar", page: "2" };
      const state = { type: ["specific" as const], status: ["scheduled" as const], period: "month" as const };

      searchParams = new URLSearchParams(query);
      const bar = render(<MyTaskTabBar active="all" counts={COUNTS} />);
      fireEvent.click(screen.getByRole("tab", { name: /Menunggu Admin/ }));
      expect(replace).toHaveBeenCalledOnce();
      const pressed = replace.mock.calls[0];
      bar.unmount();
      replace.mockClear();

      renderOn(query, state);
      fireEvent.change(screen.getByRole("combobox", { name: "Tampilkan" }), { target: { value: "waiting" } });

      expect(replace).toHaveBeenCalledExactlyOnceWith(...pressed);
    });

    it("counts a tab other than Semua as a filter in use", () => {
      renderOn({ tab: "waiting" }, { tab: "waiting" });

      expect(screen.getByRole("button", { name: "Filter, 1 aktif" })).toBeInTheDocument();
    });

    it("counts nothing while nothing is narrowed, the search being its own box", () => {
      renderOn({ q: "serum" });

      expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    });

    // E1: a period is taken off where it is chosen. Picking Semua periode takes the period and
    // both custom days off in one navigation, so the list renders once and no address with half
    // a period on it is ever opened; the tab, the view and the search stay.
    it("takes the deadline range off in one navigation, keeping the tab, the view and the search", () => {
      renderOn(
        { ...NARROWED, tab: "waiting", view: "calendar", q: "serum" },
        { tab: "waiting", period: "custom" },
      );

      fireEvent.change(screen.getByRole("combobox", { name: "Periode" }), { target: { value: "all" } });

      expect(replace).toHaveBeenCalledExactlyOnceWith(
        "/creator/tasks?type=evergreen&status=scheduled%2Cdraft_revision&overdue=yes&tab=waiting&view=calendar&q=serum",
        { scroll: false },
      );
    });

    it("takes a named period off in one navigation, keeping every other filter", () => {
      renderOn({ type: "specific", period: "month", tab: "waiting" }, { tab: "waiting", period: "month" });

      fireEvent.change(screen.getByRole("combobox", { name: "Periode" }), { target: { value: "all" } });

      expect(replace).toHaveBeenCalledExactlyOnceWith("/creator/tasks?type=specific&tab=waiting", {
        scroll: false,
      });
    });
  });
});
