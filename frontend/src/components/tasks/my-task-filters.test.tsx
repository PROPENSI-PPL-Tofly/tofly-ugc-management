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

  it("offers only Perlu Dikerjakan's statuses on that tab", () => {
    renderOn({ tab: "action" }, { tab: "action" });

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));

    expect(screen.getByRole("checkbox", { name: "Scheduled" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Perlu Revisi" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Draft Menunggu Review" })).not.toBeInTheDocument();
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
});
