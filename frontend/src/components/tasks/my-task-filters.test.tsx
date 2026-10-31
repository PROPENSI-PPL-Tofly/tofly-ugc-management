import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_MY_TASKS_PARAMS, type MyTasksParams } from "@/lib/my-tasks";
import { MyTaskFilters } from "./my-task-filters";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/creator/tasks",
}));

/** Renders the bar on an address, with the server's reading of it as the bar's state. */
function renderOn(query: Record<string, string> = {}, state: Partial<MyTasksParams> = {}) {
  searchParams = new URLSearchParams(query);
  return render(<MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, ...state }} />);
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
    expect(screen.getByRole("button", { name: /^Tipe:/ })).toBeInTheDocument();
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

  it("puts picked types in the address, comma-separated", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Specific" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?type=specific", { scroll: false });
  });

  it("puts picked statuses in the address", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Draft Perlu Revisi" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?status=draft_revision", { scroll: false });
  });

  it("drops a type pick from its chip, leaving the status picks alone", () => {
    renderOn(
      { type: "evergreen,specific", status: "scheduled,draft_revision" },
      { type: ["evergreen", "specific"], status: ["scheduled", "draft_revision"] },
    );

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Tipe: Evergreen" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/creator/tasks?type=specific&status=scheduled%2Cdraft_revision",
      { scroll: false },
    );
  });

  it("drops a status pick from its chip, leaving the type picks alone", () => {
    renderOn(
      { type: "specific", status: "scheduled,draft_revision" },
      { type: ["specific"], status: ["scheduled", "draft_revision"] },
    );

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?type=specific&status=draft_revision", {
      scroll: false,
    });
  });

  // A typed or stale address can name what the page does not hold. The list ignores it, so
  // the bar must not draw it as a pick either.
  it("shows no chip for a type or a status the address names but the filter does not offer", () => {
    renderOn(
      { type: "evergreen,foo", status: "pending, scheduled ,bogus" },
      { type: ["evergreen"], status: ["scheduled"] },
    );

    expect(screen.getByRole("button", { name: "Hapus filter Tipe: Evergreen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Hapus filter/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Tipe:/ })).toHaveTextContent("Evergreen");
    expect(screen.getByRole("button", { name: /^Status:/ })).toHaveTextContent("Scheduled");
  });

  it("shows every pick of a type the address repeats, as the list is narrowed by all of them", () => {
    searchParams = new URLSearchParams("type=evergreen&type=specific");
    render(
      <MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, type: ["evergreen", "specific"] }} />,
    );

    expect(screen.getByRole("button", { name: /^Tipe:/ })).toHaveTextContent("2 dipilih");
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

    fireEvent.change(screen.getByLabelText("Dari"), { target: { value: "2026-10-01" } });

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?period=custom&from=2026-10-01", {
      scroll: false,
    });
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
        <MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, ...state }} view="calendar" />,
      );
    }

    it("offers no Periode: the month on show is already the calendar's period", () => {
      renderOnCalendar();

      expect(screen.queryByLabelText("Periode")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Overdue")).toBeInTheDocument();
    });

    it("offers no Reset for a period left in an old calendar link, which narrows nothing", () => {
      renderOnCalendar({ period: "month" });

      expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    });

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
    render(<MyTaskFilters state={{ ...DEFAULT_MY_TASKS_PARAMS, overdue: "yes" }} view="table" />);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenLastCalledWith("/creator/tasks", { scroll: false });
  });
});
