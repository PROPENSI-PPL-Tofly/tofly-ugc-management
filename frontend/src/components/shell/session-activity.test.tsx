import { act, fireEvent, render } from "@testing-library/react";
import { SessionActivity } from "./session-activity";

describe("SessionActivity", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes the browser cookie through the same-origin proxy while active", async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    render(<SessionActivity />);

    expect(fetch).toHaveBeenCalledWith('/api/auth/session/activity', { method: 'POST' });
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    fireEvent.pointerDown(document);
    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops refreshing once five minutes pass without any activity", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    render(<SessionActivity />);

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    // Only the pulse sent on mount: an idle tab must not keep its session alive forever.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the tab is hidden, even right after activity", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    render(<SessionActivity />);

    fireEvent.keyDown(document);
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops listening and ticking once it is unmounted", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { unmount } = render(<SessionActivity />);

    unmount();
    fireEvent.pointerDown(document);
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
