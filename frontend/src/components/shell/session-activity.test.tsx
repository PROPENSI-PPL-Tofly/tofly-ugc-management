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
});
