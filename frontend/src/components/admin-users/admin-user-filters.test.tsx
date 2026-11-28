import { act, fireEvent, render, screen } from "@testing-library/react";
import { AdminUserFilters } from "./admin-user-filters";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/users",
}));

function renderFilters(query = "") {
  searchParams = new URLSearchParams(query);
  return render(<AdminUserFilters />);
}

function search() {
  return screen.getByRole("searchbox", { name: /cari admin/i });
}

/** Past the debounce, so the URL change the typing scheduled actually runs. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe("Pengguna Admin's search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers one box for a name or an email", () => {
    renderFilters();

    expect(search()).toHaveAttribute("placeholder", "Nama atau email...");
  });

  it("writes the typed search to the address once typing pauses", () => {
    renderFilters();

    fireEvent.change(search(), { target: { value: "rangga" } });
    settle();

    expect(replace).toHaveBeenCalledWith("/admin/users?q=rangga", { scroll: false });
  });

  // Page 3 of the old search says nothing about page 3 of the new one.
  it("drops the old page from the address when the search changes", () => {
    renderFilters("q=rangga&page=3");

    fireEvent.change(search(), { target: { value: "salsa" } });
    settle();

    expect(replace).toHaveBeenCalledWith("/admin/users?q=salsa", { scroll: false });
  });

  it("clears the search and the page when the box is emptied", () => {
    renderFilters("q=rangga&page=2");

    fireEvent.change(search(), { target: { value: "" } });
    settle();

    expect(replace).toHaveBeenCalledWith("/admin/users", { scroll: false });
  });

  it("follows a search the address changed from elsewhere", () => {
    const { rerender } = renderFilters();

    searchParams = new URLSearchParams("q=salsa");
    rerender(<AdminUserFilters />);

    expect(search()).toHaveValue("salsa");
  });
});
