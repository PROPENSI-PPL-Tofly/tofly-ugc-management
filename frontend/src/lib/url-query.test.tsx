import { act, renderHook } from "@testing-library/react";

const replace = vi.fn();
let searchParams = new URLSearchParams();
let pathname = "/admin/content-plan";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => pathname,
}));

import { latestQuery, useUrlQuery } from "./url-query";

// The address bar only changes once the server has rendered. Every control that rewrites the
// query string (the filter bar, the tabs, the sort header) therefore has to build on what was
// last sent, not on what the address bar still shows, and they have to share that knowledge.
describe("useUrlQuery", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
    pathname = "/admin/content-plan";
  });

  it("reads the query the address bar shows while nothing is on its way", () => {
    searchParams = new URLSearchParams({ tab: "waiting" });
    const { result } = renderHook(() => useUrlQuery());

    expect(result.current.query).toBe("tab=waiting");
    expect(latestQuery()).toBe("tab=waiting");
  });

  it("navigates to the query it is given, on the page it is on", () => {
    const { result } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("tab=waiting"));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/admin/content-plan?tab=waiting", {
      scroll: false,
    });
  });

  it("navigates to the bare path for an empty query", () => {
    searchParams = new URLSearchParams({ tab: "waiting" });
    const { result } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery(""));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/admin/content-plan", { scroll: false });
    expect(result.current.query).toBe("");
  });

  it("shows a change to every control at once, before the address bar has it", () => {
    const tabs = renderHook(() => useUrlQuery());
    const filters = renderHook(() => useUrlQuery());

    act(() => filters.result.current.replaceQuery("creator=id-1"));

    expect(tabs.result.current.query).toBe("creator=id-1");
    expect(filters.result.current.query).toBe("creator=id-1");
    expect(latestQuery()).toBe("creator=id-1");
  });

  it("follows the address bar again once the change has landed", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    searchParams = new URLSearchParams({ creator: "id-1" });
    rerender();
    // Back, a pagination link, anything this page did not send.
    searchParams = new URLSearchParams({ page: "2" });
    rerender();

    expect(result.current.query).toBe("page=2");
    expect(latestQuery()).toBe("page=2");
  });

  it("stays ahead when an older change of its own lands after a newer one was sent", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    act(() => result.current.replaceQuery("creator=id-1&tab=waiting"));
    searchParams = new URLSearchParams({ creator: "id-1" });
    rerender();

    expect(result.current.query).toBe("creator=id-1&tab=waiting");
  });

  it("follows the address bar when it moves to something this page never sent", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    searchParams = new URLSearchParams({ page: "3" });
    rerender();

    expect(result.current.query).toBe("page=3");
  });

  // Tick and untick before the address bar moves: the second change asks for what the bar
  // already shows, so nothing will ever "land" to clear what was sent. Left behind, the first
  // query would later be mistaken for this page's own change and ignored.
  it("leaves nothing on its way after a change back to what the address bar shows", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    act(() => result.current.replaceQuery(""));
    expect(result.current.query).toBe("");
    expect(replace).toHaveBeenLastCalledWith("/admin/content-plan", { scroll: false });

    searchParams = new URLSearchParams({ creator: "id-1" });
    rerender();

    expect(result.current.query).toBe("creator=id-1");
  });

  it("clears everything sent once the newest change lands, duplicates included", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    act(() => result.current.replaceQuery("creator=id-2"));
    act(() => result.current.replaceQuery("creator=id-1"));
    searchParams = new URLSearchParams({ creator: "id-1" });
    rerender();

    // "creator=id-2" was sent and superseded; arriving now, it is somebody else's move.
    searchParams = new URLSearchParams({ creator: "id-2" });
    rerender();

    expect(result.current.query).toBe("creator=id-2");
  });

  // Some changes need no server round trip: which content's panel is open, say. They are
  // written straight into the address. Found in the app: written that way while a filter
  // change was still on its way, the write cancelled the change and the tick was lost.
  describe("a quiet write, with no navigation", () => {
    let written: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      window.history.replaceState({}, "", "/admin/content-plan");
      written = vi.spyOn(window.history, "replaceState");
    });

    afterEach(() => {
      written.mockRestore();
    });

    it("puts the query in the address without asking the server for anything", () => {
      const { result } = renderHook(() => useUrlQuery());

      act(() => result.current.replaceQuietly("content=c-1"));

      expect(window.location.search).toBe("?content=c-1");
      expect(replace).not.toHaveBeenCalled();
      expect(latestQuery()).toBe("content=c-1");
    });

    it("writes the bare path for an empty query, and keeps the hash", () => {
      window.history.replaceState({}, "", "/admin/content-plan?content=c-1#bawah");
      searchParams = new URLSearchParams({ content: "c-1" });
      written.mockClear();
      const { result } = renderHook(() => useUrlQuery());

      act(() => result.current.replaceQuietly(""));

      expect(written).toHaveBeenCalledExactlyOnceWith(null, "", "/admin/content-plan#bawah");
    });

    it("does not take its own write for somebody else's move when the address shows it", () => {
      const { result, rerender } = renderHook(() => useUrlQuery());

      act(() => result.current.replaceQuietly("content=c-1"));
      act(() => result.current.replaceQuery("content=c-1&creator=id-1"));
      // Next reports the quiet write only now, with the filter change already sent.
      searchParams = new URLSearchParams({ content: "c-1" });
      rerender();

      expect(result.current.query).toBe("content=c-1&creator=id-1");
    });

    it("goes the full way while a change is on its way, so it cannot cancel that change", () => {
      const { result } = renderHook(() => useUrlQuery());

      act(() => result.current.replaceQuery("type=evergreen"));
      written.mockClear();
      act(() => result.current.replaceQuietly("type=evergreen&content=c-1"));

      expect(written).not.toHaveBeenCalled();
      expect(replace).toHaveBeenLastCalledWith(
        "/admin/content-plan?type=evergreen&content=c-1",
        { scroll: false },
      );
      expect(result.current.query).toBe("type=evergreen&content=c-1");
    });
  });

  it("starts clean on another page, even with a change still on its way from the last one", () => {
    const { result, rerender } = renderHook(() => useUrlQuery());

    act(() => result.current.replaceQuery("creator=id-1"));
    pathname = "/admin/creators";
    rerender();

    expect(result.current.query).toBe("");
    act(() => result.current.replaceQuery("q=ra"));
    expect(replace).toHaveBeenLastCalledWith("/admin/creators?q=ra", { scroll: false });
  });

  it("forgets what was on its way once the last control using it is gone", () => {
    const first = renderHook(() => useUrlQuery());
    act(() => first.result.current.replaceQuery("creator=id-1"));
    first.unmount();

    const second = renderHook(() => useUrlQuery());

    expect(second.result.current.query).toBe("");
    expect(latestQuery()).toBe("");
  });
});
