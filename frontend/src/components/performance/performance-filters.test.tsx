import { act, fireEvent, render, screen } from "@testing-library/react";
import { PerformanceFilters } from "./performance-filters";

const mockReplace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/performance",
}));

const CREATORS = [
  { id: "id-1", name: "Salsa" },
  { id: "id-2", name: "Rangga" },
];

function renderFilters() {
  return render(<PerformanceFilters creators={CREATORS} />);
}

function renderCreatorFilters() {
  return render(<PerformanceFilters />);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReplace.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PerformanceFilters", () => {
  it("offers the creator and platform multi-selects (AC 23)", () => {
    renderFilters();

    expect(screen.getByRole("button", { name: /^Creator:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Platform:/ })).toBeInTheDocument();
  });

  it("offers the Status Data multi-select, named as the table's column is", () => {
    renderFilters();

    expect(screen.getByRole("button", { name: /^Status Data:/ })).toBeInTheDocument();
  });

  it("lists every state by the badge's own words and picks one into the address", () => {
    searchParams = new URLSearchParams({ page: "2" });
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Status Data:/ }));
    for (const label of [
      "Tersinkron",
      "Menunggu data",
      "Akun belum terhubung",
      "Link tidak ditemukan",
      "Gagal sinkron",
      "Diisi manual",
    ]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Tersinkron" }));

    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?state=synced", {
      scroll: false,
    });
  });

  it("drops a state from its chip, and Reset clears it with the rest", () => {
    searchParams = new URLSearchParams({ state: "synced,manual" });
    const first = renderFilters();
    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Status Data: Tersinkron" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?state=manual", {
      scroll: false,
    });
    first.unmount();

    searchParams = new URLSearchParams({ state: "synced" });
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance", { scroll: false });
  });

  it("leaves the Creator filter out where no creators are given, as a creator reads only their own", () => {
    renderCreatorFilters();

    expect(screen.queryByRole("button", { name: /^Creator:/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Platform:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status Data:/ })).toBeInTheDocument();
  });

  it("picks a platform into the address, dropping the old page", () => {
    searchParams = new URLSearchParams({ page: "3" });
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Platform:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram" }));

    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?platform=instagram", {
      scroll: false,
    });
  });

  it("picks creators and drops them from their chips, one press each", () => {
    const first = renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Creator:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Salsa" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?creator=id-1", {
      scroll: false,
    });

    first.unmount();
    searchParams = new URLSearchParams({ creator: "id-1,id-2" });
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }));

    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?creator=id-2", {
      scroll: false,
    });
  });

  it("clears every filter at once with Reset", () => {
    searchParams = new URLSearchParams({ creator: "id-1", platform: "instagram" });
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance", { scroll: false });
  });

  // I3.2 (SCRUM-279): the search box, as Content Plan has it.
  describe("the search box", () => {
    const box = () => screen.getByRole("searchbox", { name: "Cari konten atau creator" });

    it("sends the search to the address once typing pauses, dropping the old page", () => {
      searchParams = new URLSearchParams({ page: "3" });
      renderFilters();

      fireEvent.change(box(), { target: { value: "rani" } });
      expect(mockReplace).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(300));
      expect(mockReplace).toHaveBeenCalledWith("/admin/performance?q=rani", { scroll: false });
    });

    it("shows the search the address holds, and takes at most 100 characters", () => {
      searchParams = new URLSearchParams({ q: "kopi" });
      renderFilters();

      expect(box()).toHaveValue("kopi");
      expect(box()).toHaveAttribute("maxLength", "100");
    });

    it("is cleared with the other filters by Reset, which a search alone offers", () => {
      searchParams = new URLSearchParams({ q: "kopi" });
      renderFilters();

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance", { scroll: false });
      expect(box()).toHaveValue("");
    });
  });

  it("drops one platform from its chip, keeping the other", () => {
    searchParams = new URLSearchParams({ platform: "instagram,tiktok" });
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Platform: Instagram" }));

    expect(mockReplace).toHaveBeenLastCalledWith("/admin/performance?platform=tiktok", {
      scroll: false,
    });
  });

  it("shows no chip for a platform the address names but the filter does not offer", () => {
    searchParams = new URLSearchParams({ platform: "youtube" });
    renderFilters();

    expect(screen.queryByRole("button", { name: /^Hapus filter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
