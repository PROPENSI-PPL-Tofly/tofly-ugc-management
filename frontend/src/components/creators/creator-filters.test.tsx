import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/creators",
}));

import { CreatorFilters } from "./creator-filters";

function renderFilters(overrides: Record<string, string> = {}) {
  searchParams = new URLSearchParams(overrides);
  render(<CreatorFilters />);
}

describe("CreatorFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it("renders search input", () => {
    renderFilters();

    expect(screen.getByRole("searchbox", { name: /cari creator/i })).toBeInTheDocument();
  });

  it("renders contract status dropdown", () => {
    renderFilters();

    expect(screen.getByRole("combobox", { name: /status kontrak/i })).toBeInTheDocument();
  });

  it("renders productivity dropdown", () => {
    renderFilters();

    expect(screen.getByRole("combobox", { name: /produktivitas/i })).toBeInTheDocument();
  });

  it("reflects current filter values in inputs", () => {
    renderFilters({ q: "rangga", contract: "active" });

    expect(screen.getByRole("searchbox", { name: /cari creator/i })).toHaveValue("rangga");
    expect(screen.getByRole("combobox", { name: /status kontrak/i })).toHaveValue("active");
  });

  it("updates URL on search input change", async () => {
    renderFilters();

    await userEvent.type(screen.getByRole("searchbox", { name: /cari creator/i }), "rangga");

    expect(replace).toHaveBeenCalled();
    const lastCall = replace.mock.calls.at(-1)!;
    expect(lastCall[0]).toContain("q=");
    expect(lastCall[1]).toEqual({ scroll: false });
  });

  it("updates URL on dropdown change", async () => {
    renderFilters();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /status kontrak/i }),
      "active",
    );

    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("contract=active"),
      { scroll: false },
    );
  });

  it("does not show reset button when no filters active", () => {
    renderFilters();

    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows reset button when any filter is active", () => {
    renderFilters({ q: "rangga" });

    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("resets all filters when reset button clicked", async () => {
    renderFilters({ q: "rangga", contract: "active" });

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });
});
