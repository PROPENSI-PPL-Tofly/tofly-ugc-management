import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows no chip for a platform the address names but the filter does not offer", () => {
    searchParams = new URLSearchParams({ platform: "youtube" });
    renderFilters();

    expect(screen.queryByRole("button", { name: /^Hapus filter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
