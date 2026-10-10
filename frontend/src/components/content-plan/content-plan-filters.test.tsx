import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanParams } from "@/lib/content-plan";
import { DEFAULT_CONTENT_PLAN_PARAMS } from "@/lib/content-plan";
import { ContentPlanFilters } from "./content-plan-filters";

const mockReplace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/content-plan",
}));

const CREATORS = [
  { id: "id-1", name: "Salsa" },
  { id: "id-2", name: "Rangga" },
];

function renderFilters(state: Partial<ContentPlanParams> = {}) {
  const view = render(
    <ContentPlanFilters
      state={{ ...DEFAULT_CONTENT_PLAN_PARAMS, ...state }}
      creators={CREATORS}
    />,
  );
  return {
    ...view,
    rerenderWith(params: URLSearchParams, nextState: Partial<ContentPlanParams> = state) {
      searchParams = params;
      view.unmount();
      return renderFilters(nextState);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReplace.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ContentPlanFilters", () => {
  it("offers the search box, the three multi-selects, and the two single selects", () => {
    renderFilters();

    expect(screen.getByRole("searchbox", { name: "Cari konten atau creator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Creator:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tipe:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status:/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Overdue")).toBeInTheDocument();
    expect(screen.getByLabelText("Periode")).toBeInTheDocument();
  });

  it("sends the search to the URL once typing pauses, dropping the old page", () => {
    renderFilters().rerenderWith(new URLSearchParams({ page: "3" }));

    fireEvent.change(screen.getByRole("searchbox", { name: "Cari konten atau creator" }), {
      target: { value: "salsa" },
    });
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(mockReplace).toHaveBeenCalledWith("/admin/content-plan?q=salsa", { scroll: false });
  });

  it("narrows by overdue and clears it back to all", () => {
    let view = renderFilters();
    fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "yes" } });
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan?overdue=yes", {
      scroll: false,
    });

    view = view.rerenderWith(new URLSearchParams({ overdue: "yes" }));
    fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "all" } });
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan", { scroll: false });
    view.unmount();
  });

  it("offers the five periods and shows the custom dates only on Pilih tanggal", () => {
    const view = renderFilters();
    const options = Array.from((screen.getByLabelText("Periode") as HTMLSelectElement).options).map(
      (option) => [option.value, option.text],
    );
    expect(options).toEqual([
      ["all", "Semua periode"],
      ["month", "Bulan ini"],
      ["next30", "30 hari ke depan"],
      ["last90", "90 hari terakhir"],
      ["custom", "Pilih tanggal…"],
    ]);
    expect(screen.queryByLabelText("Dari")).not.toBeInTheDocument();

    view.rerenderWith(new URLSearchParams({ period: "custom" }), { period: "custom" });
    expect(screen.getByLabelText("Dari")).toBeInTheDocument();
    expect(screen.getByLabelText("Sampai")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Dari"), { target: { value: "2026-10-01" } });
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/admin/content-plan?period=custom&from=2026-10-01",
      { scroll: false },
    );
  });

  it("says the period does not reach Perlu Approval while one is set there", () => {
    searchParams = new URLSearchParams({ tab: "action", period: "month" });
    renderFilters({ tab: "action", period: "month" });
    expect(screen.getByText("Periode tidak berlaku di tab ini")).toBeInTheDocument();
  });

  it("scopes the status choices to the tab it is on", () => {
    renderFilters({ tab: "action" });
    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Menunggu Review" })).toBeInTheDocument();
  });

  it("keeps the status filter away from the Selesai tab, which holds one status", () => {
    renderFilters({ tab: "done" });
    expect(screen.queryByRole("button", { name: /^Status:/ })).not.toBeInTheDocument();
  });

  it("keeps the overdue filter away from the Selesai tab too", () => {
    renderFilters({ tab: "done" });
    expect(screen.queryByLabelText("Overdue")).not.toBeInTheDocument();
  });

  it("picks creators and drops them from their chips, one press each", () => {
    let view = renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Creator:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Salsa" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan?creator=id-1", {
      scroll: false,
    });

    view = view.rerenderWith(new URLSearchParams({ creator: "id-1,id-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan?creator=id-2", {
      scroll: false,
    });
    view.unmount();
  });

  it("offers the two content types in its own multi-select", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    expect(screen.getByRole("checkbox", { name: "Evergreen" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Specific" })).toBeInTheDocument();
  });

  it("picks types and statuses, one URL write each", () => {
    let view = renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Evergreen" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan?type=evergreen", {
      scroll: false,
    });

    view = view.rerenderWith(new URLSearchParams({ type: "evergreen" }));
    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Draft Menunggu Review" }));
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/admin/content-plan?type=evergreen&status=draft_review",
      { scroll: false },
    );
    view.unmount();
  });

  it("turns the period over and dates the far end of a custom range", () => {
    let view = renderFilters();

    fireEvent.change(screen.getByLabelText("Periode"), { target: { value: "month" } });
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/content-plan?period=month", {
      scroll: false,
    });

    view = view.rerenderWith(new URLSearchParams({ period: "custom" }), { period: "custom" });
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "2026-10-31" } });
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/admin/content-plan?period=custom&to=2026-10-31",
      { scroll: false },
    );
    view.unmount();
  });

  it("offers Reset only while something narrows the view, and keeps the tab on it", () => {
    const view = renderFilters();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    view.rerenderWith(new URLSearchParams({ q: "salsa", tab: "action", page: "2" }), {
      tab: "action",
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(mockReplace).toHaveBeenCalledWith("/admin/content-plan?tab=action", {
      scroll: false,
    });
  });

  it("opens the bare address when Reset is pressed on Semua", () => {
    const view = renderFilters();
    view.rerenderWith(new URLSearchParams({ q: "salsa", overdue: "yes" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(mockReplace).toHaveBeenCalledWith("/admin/content-plan", { scroll: false });
  });

  it("shows the custom dates already sitting in the URL", () => {
    searchParams = new URLSearchParams({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    renderFilters({ period: "custom", from: "2026-10-01", to: "2026-10-31" });

    expect(screen.getByLabelText("Dari")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Sampai")).toHaveValue("2026-10-31");
  });
});
