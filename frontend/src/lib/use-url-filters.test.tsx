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

  // Found on the Content Plan: the URL only changes once the server has rendered, so a second
  // tick made before that was built on the old URL and dropped the first one.
  describe("while the URL is still catching up", () => {
    it("shows a change at once, without waiting for the URL", () => {
      const { result } = renderHook(() => useUrlFilters());

      act(() => result.current.setParam("creator", "id-1"));

      expect(result.current.param("creator")).toBe("id-1");
    });

    it("keeps the first change when a second is made before the URL has it", () => {
      const { result } = renderHook(() => useUrlFilters());

      act(() => result.current.setParam("creator", "id-1"));
      act(() => result.current.setParam("type", "specific"));

      expect(replace).toHaveBeenLastCalledWith("/admin/creators?creator=id-1&type=specific", {
        scroll: false,
      });
    });

    it("keeps both changes when they are made in the same breath", () => {
      const { result } = renderHook(() => useUrlFilters());

      act(() => {
        result.current.setParam("creator", "id-1");
        result.current.setParam("type", "specific");
      });

      expect(replace).toHaveBeenLastCalledWith("/admin/creators?creator=id-1&type=specific", {
        scroll: false,
      });
    });

    it("does not let an older change that lands late undo a newer one", () => {
      const { result, rerender } = renderHook(() => useUrlFilters());

      act(() => result.current.setParam("creator", "id-1"));
      act(() => result.current.setParam("type", "specific"));
      // The first navigation arrives while the second is still on its way.
      searchParams = new URLSearchParams({ creator: "id-1" });
      rerender();

      expect(result.current.param("type")).toBe("specific");

      act(() => result.current.setParam("overdue", "yes"));
      expect(replace).toHaveBeenLastCalledWith(
        "/admin/creators?creator=id-1&type=specific&overdue=yes",
        { scroll: false },
      );
    });

    it("settles once its own change has landed, then follows the URL again", () => {
      const { result, rerender } = renderHook(() => useUrlFilters());

      act(() => result.current.setParam("creator", "id-1"));
      searchParams = new URLSearchParams({ creator: "id-1" });
      rerender();
      expect(result.current.param("creator")).toBe("id-1");

      // Back, a tab press or a link: a URL this bar never sent.
      searchParams = new URLSearchParams({ type: "evergreen" });
      rerender();

      expect(result.current.param("creator")).toBe("all");
      expect(result.current.param("type")).toBe("evergreen");
    });

    it("follows the URL over a change of its own that never landed", () => {
      const { result, rerender } = renderHook(() => useUrlFilters());

      act(() => result.current.setParam("creator", "id-1"));
      searchParams = new URLSearchParams({ tab: "done" });
      rerender();

      expect(result.current.param("creator")).toBe("all");
      act(() => result.current.setParam("type", "specific"));
      expect(replace).toHaveBeenLastCalledWith("/admin/creators?tab=done&type=specific", {
        scroll: false,
      });
    });

    it("resets down to what the caller keeps, and builds the next change on that", () => {
      searchParams = new URLSearchParams({ tab: "waiting", q: "ra", type: "specific" });
      const { result } = renderHook(() => useUrlFilters());

      act(() => result.current.resetKeeping({ tab: "waiting" }));
      expect(result.current.search).toBe("");
      expect(result.current.param("type")).toBe("all");
      expect(result.current.param("tab")).toBe("waiting");
      settle();

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith("/admin/creators?tab=waiting", { scroll: false });
    });

    it("shows every filter as cleared the moment it is reset", () => {
      searchParams = new URLSearchParams({ contractStatus: "active" });
      const { result } = renderHook(() => useUrlFilters());

      act(() => result.current.reset());
      expect(result.current.param("contractStatus")).toBe("all");

      act(() => result.current.setParam("productivity", "risk"));
      expect(replace).toHaveBeenLastCalledWith("/admin/creators?productivity=risk", {
        scroll: false,
      });
    });
  });
});
