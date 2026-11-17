import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "./use-countdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the given number of seconds and counts down once a second", () => {
    const { result } = renderHook(() => useCountdown(60));

    expect(result.current.secondsLeft).toBe(60);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(59);
    act(() => vi.advanceTimersByTime(58_000));
    expect(result.current.secondsLeft).toBe(1);
  });

  it("stops at zero and stops ticking", () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => vi.advanceTimersByTime(10_000));

    expect(result.current.secondsLeft).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts again from the full count on restart", () => {
    const { result } = renderHook(() => useCountdown(60));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.secondsLeft).toBe(0);

    act(() => result.current.restart());

    expect(result.current.secondsLeft).toBe(60);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(59);
  });

  it("restarts from the full count while still counting, with one timer only", () => {
    const { result } = renderHook(() => useCountdown(60));
    act(() => vi.advanceTimersByTime(20_000));

    act(() => result.current.restart());

    expect(result.current.secondsLeft).toBe(60);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("leaves no timer behind once the screen is gone", () => {
    const { unmount } = renderHook(() => useCountdown(60));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
