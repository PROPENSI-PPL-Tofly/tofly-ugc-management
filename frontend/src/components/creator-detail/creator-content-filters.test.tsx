import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanTab } from "@/lib/content-plan";
import { CreatorContentFilters } from "./creator-content-filters";

const mockReplace = vi.fn();
let searchParams = new URLSearchParams();

const PAGE = "/admin/creators/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
  usePathname: () => PAGE,
}));

/** Renders the bar on an address, the way the page would after that address was opened. */
function renderOn(params: Record<string, string> = {}, tab: ContentPlanTab = "all") {
  searchParams = new URLSearchParams(params);
  return render(<CreatorContentFilters tab={tab} />);
}

function lastAddress(): string {
  return mockReplace.mock.lastCall?.[0] as string;
}

beforeEach(() => {
  mockReplace.mockClear();
  searchParams = new URLSearchParams();
});

describe("CreatorContentFilters", () => {
  it("offers the Content Plan's search, Tipe, Status and Overdue, but no Periode: the period is the tab above", () => {
    renderOn();

    expect(screen.getByRole("searchbox", { name: "Cari judul konten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tipe:/ })).toHaveTextContent("Semua");
    expect(screen.getByRole("button", { name: /^Status:/ })).toHaveTextContent("Semua");
    expect(screen.getByLabelText("Overdue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Periode")).toBeNull();
  });

  it("offers only the statuses Perlu Approval holds on that tab", () => {
    renderOn({ tab: "action" }, "action");
    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));

    expect(screen.getByRole("checkbox", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Draft Menunggu Review" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("offers neither Status nor Overdue on Selesai, where one status is left and nothing is late", () => {
    renderOn({ tab: "done" }, "done");

    expect(screen.queryByRole("button", { name: /^Status:/ })).toBeNull();
    expect(screen.queryByLabelText("Overdue")).toBeNull();
  });

  it("writes a search to the address once typing stops, on the period it was typed on", () => {
    vi.useFakeTimers();
    try {
      renderOn({ contract: CONTRACT });

      fireEvent.change(screen.getByRole("searchbox", { name: "Cari judul konten" }), {
        target: { value: "kopi" },
      });
      act(() => {
        vi.runAllTimers();
      });

      expect(lastAddress()).toBe(`${PAGE}?contract=${CONTRACT}&q=kopi`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes an overdue choice to the address", () => {
    renderOn({ contract: CONTRACT });

    fireEvent.change(screen.getByLabelText("Overdue"), { target: { value: "yes" } });

    expect(lastAddress()).toBe(`${PAGE}?contract=${CONTRACT}&overdue=yes`);
  });

  it("resets the search and the filters but keeps the period and the tab it was pressed on", () => {
    renderOn({ contract: CONTRACT, tab: "waiting", q: "kopi", overdue: "no" }, "waiting");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(lastAddress()).toBe(`${PAGE}?contract=${CONTRACT}&tab=waiting`);
  });

  it("offers both content types", () => {
    renderOn();
    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));

    expect(screen.getByRole("checkbox", { name: "Evergreen" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Specific" })).toBeInTheDocument();
  });

  it("offers all six lifecycle statuses, worded as every admin view words them", () => {
    renderOn();
    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));

    for (const status of [
      "Pending",
      "Scheduled",
      "Draft Menunggu Review",
      "Draft Perlu Revisi",
      "Draft Approved",
      "Content Link Submitted",
    ]) {
      expect(screen.getByRole("checkbox", { name: status })).toBeInTheDocument();
    }
    // The six, under the Semua option that clears the filter.
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  it("writes a picked type to the address", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Evergreen" }));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?type=evergreen`, { scroll: false });
  });

  it("writes a picked status beside the type already picked", () => {
    renderOn({ type: "evergreen" });

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Draft Menunggu Review" }));

    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?type=evergreen&status=draft_review`, {
      scroll: false,
    });
  });

  it("keeps the first status when a second is ticked before the address has changed", () => {
    renderOn();

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Scheduled" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pending" }));

    expect(new URL(lastAddress(), "http://x").searchParams.get("status")).toBe(
      "scheduled,pending",
    );
    expect(screen.getByRole("button", { name: /^Status:/ })).toHaveTextContent("2 dipilih");
  });

  it("shows every pick of a filter the address repeats, as the table is narrowed by all of them", () => {
    searchParams = new URLSearchParams("status=scheduled&status=pending");
    render(<CreatorContentFilters tab="all" />);

    expect(screen.getByRole("button", { name: /^Status:/ })).toHaveTextContent("2 dipilih");
  });

  it("drops the old page number on a pick, as the narrowed table starts over", () => {
    renderOn({ page: "3" });

    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Specific" }));

    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?type=specific`, { scroll: false });
  });

  it("stays on the period it was picked on", () => {
    renderOn({ contract: CONTRACT, page: "2" });

    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Scheduled" }));

    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?contract=${CONTRACT}&status=scheduled`, {
      scroll: false,
    });
  });

  it("shows each pick as a chip that can be dropped on its own", () => {
    renderOn({ type: "evergreen", status: "scheduled,draft_review" });

    expect(screen.getAllByRole("button", { name: /^Hapus filter/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" }));

    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?type=evergreen&status=draft_review`, {
      scroll: false,
    });
  });

  it("takes the filter out of the address when its last pick is dropped", () => {
    renderOn({ type: "evergreen" });

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Tipe: Evergreen" }));

    expect(mockReplace).toHaveBeenLastCalledWith(PAGE, { scroll: false });
  });

  it("offers Reset only while something narrows the table", () => {
    renderOn({ contract: CONTRACT, page: "2" });

    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("resets to the bare address on the newest period", () => {
    renderOn({ type: "specific", status: "pending", page: "2" });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(mockReplace).toHaveBeenLastCalledWith(PAGE, { scroll: false });
  });

  it("resets the filters and keeps the period that is open", () => {
    renderOn({ contract: CONTRACT, type: "specific", page: "2" });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(mockReplace).toHaveBeenLastCalledWith(`${PAGE}?contract=${CONTRACT}`, {
      scroll: false,
    });
  });

  // A typed or stale address can name what a content cannot hold. The table ignores it, so
  // the bar must not draw it as a pick either.
  it("shows no chip for a type or a status that does not exist", () => {
    renderOn({ type: "evergreen,weekly", status: "<script>, scheduled ,draft_revised" });

    expect(screen.getByRole("button", { name: "Hapus filter Tipe: Evergreen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus filter Status: Scheduled" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Hapus filter/ })).toHaveLength(2);
  });

  it("leaves what does not exist behind on the next pick", () => {
    renderOn({ type: "weekly,evergreen" });

    fireEvent.click(screen.getByRole("button", { name: /^Tipe:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Specific" }));

    expect(new URL(lastAddress(), "http://x").searchParams.get("type")).toBe("evergreen,specific");
  });

  it("still offers Reset when the address holds only values that do not exist", () => {
    renderOn({ status: "bogus" });

    expect(screen.queryByRole("button", { name: /^Hapus filter/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
