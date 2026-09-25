import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

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

function search() {
  return screen.getByRole("searchbox", { name: /cari creator/i });
}

function contractStatus() {
  return screen.getByRole("combobox", { name: /status kontrak/i });
}

/** Past the debounce, so the URL update the typing scheduled actually runs. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe("CreatorFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a search box and both dropdowns", () => {
    renderFilters();

    expect(search()).toBeInTheDocument();
    expect(contractStatus()).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /produktivitas/i })).toBeInTheDocument();
  });

  it("offers every contract status the API accepts", () => {
    renderFilters();

    const values = Array.from(contractStatus().querySelectorAll("option")).map(
      (option) => option.value,
    );
    expect(values).toEqual(["all", "active", "expired", "upcoming", "none"]);
  });

  it("offers every productivity band the API accepts, including no data yet", () => {
    renderFilters();

    const options = Array.from(
      screen.getByRole("combobox", { name: /produktivitas/i }).querySelectorAll("option"),
    ).map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ["all", "Semua"],
      ["good", "Baik"],
      ["watch", "Perlu Perhatian"],
      ["risk", "Berisiko"],
      ["no_data", "Belum Ada Data"],
    ]);
  });

  it("reflects current filter values in inputs", () => {
    renderFilters({ q: "rangga", contractStatus: "active" });

    expect(search()).toHaveValue("rangga");
    expect(contractStatus()).toHaveValue("active");
  });

  it("waits for a pause in typing before updating the URL", () => {
    renderFilters();

    fireEvent.change(search(), { target: { value: "ran" } });
    fireEvent.change(search(), { target: { value: "rangga" } });

    // Still mid-word: nothing has been sent yet.
    expect(replace).not.toHaveBeenCalled();

    settle();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("q=rangga"), {
      scroll: false,
    });
  });

  it("updates the URL with the API's parameter name on a dropdown change", () => {
    renderFilters();

    fireEvent.change(contractStatus(), { target: { value: "active" } });

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("contractStatus=active"), {
      scroll: false,
    });
  });

  it("drops the page number when a filter changes", () => {
    renderFilters({ page: "3" });

    fireEvent.change(contractStatus(), { target: { value: "expired" } });

    expect(replace.mock.calls.at(-1)![0]).not.toContain("page=");
  });

  it("does not show the reset button when no filter is active", () => {
    renderFilters();

    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows the reset button when any filter is active", () => {
    renderFilters({ q: "rangga" });

    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("resets every filter back to the bare path", () => {
    renderFilters({ q: "rangga", contractStatus: "active" });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  it("filters by productivity band", () => {
    renderFilters();

    fireEvent.change(screen.getByRole("combobox", { name: /produktivitas/i }), {
      target: { value: "risk" },
    });

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("productivity=risk"), {
      scroll: false,
    });
  });

  it("goes back to the bare path when the only filter is set back to all", () => {
    renderFilters({ contractStatus: "active" });

    fireEvent.change(contractStatus(), { target: { value: "all" } });

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  // Back/forward changes q in the URL without any typing; the box has to follow it.
  it("follows a search the URL changed on its own", () => {
    searchParams = new URLSearchParams({ q: "rangga" });
    const { rerender } = render(<CreatorFilters />);

    searchParams = new URLSearchParams({ q: "salsa" });
    rerender(<CreatorFilters />);

    expect(search()).toHaveValue("salsa");
  });
});
