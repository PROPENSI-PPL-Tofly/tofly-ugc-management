import { act, renderHook } from "@testing-library/react";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/creators",
}));

import { SEARCH_DEBOUNCE_MS, useUrlFilters } from "./use-url-filters";

function settle() {
  act(() => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 100);
  });
}

describe("useUrlFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the search once typing pauses, keeping other filters and dropping the page", () => {
    searchParams = new URLSearchParams({ contractStatus: "active", page: "3" });
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current.setSearch("ra"));
    expect(replace).not.toHaveBeenCalled();
    settle();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin/creators?contractStatus=active&q=ra", {
      scroll: false,
    });
  });

  it("does not send a search made only of spaces", () => {
    searchParams = new URLSearchParams({ q: "ra" });
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current.setSearch("   "));
    settle();

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  it("reads a filter, with 'all' standing for one that is not applied", () => {
    searchParams = new URLSearchParams({ productivity: "risk" });
    const { result } = renderHook(() => useUrlFilters());

    expect(result.current.param("productivity")).toBe("risk");
    expect(result.current.param("contractStatus")).toBe("all");
  });

  it("removes a filter set back to all", () => {
    searchParams = new URLSearchParams({ contractStatus: "active", q: "ra" });
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current.setParam("contractStatus", "all"));

    expect(replace).toHaveBeenCalledWith("/admin/creators?q=ra", { scroll: false });
  });

  // The UAT bug: the URL still held the old search while the reset was on its way, so the
  // debounce sent "q cleared" on top of the old filters and put them back.
  it("resets the search and every filter, and nothing puts them back afterwards", () => {
    searchParams = new URLSearchParams({ q: "ra", contractStatus: "active", productivity: "risk" });
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current.reset());
    expect(result.current.search).toBe("");
    settle();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  it("follows a search the URL changed on its own", () => {
    searchParams = new URLSearchParams({ q: "ra" });
    const { result, rerender } = renderHook(() => useUrlFilters());

    searchParams = new URLSearchParams({ q: "salsa" });
    rerender();

    expect(result.current.search).toBe("salsa");
    settle();
    expect(replace).not.toHaveBeenCalled();
  });
});
