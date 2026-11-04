import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "./use-countdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0, so nothing is locked before a code was sent", () => {
    const { result } = renderHook(() => useCountdown());

    expect(result.current.secondsLeft).toBe(0);
  });

  it("counts down a second at a time and stops at 0", () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start(60));
    expect(result.current.secondsLeft).toBe(60);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(59);

    act(() => vi.advanceTimersByTime(59_000));
    expect(result.current.secondsLeft).toBe(0);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.secondsLeft).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts over from the new length when started again", () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start(60));
    act(() => vi.advanceTimersByTime(30_000));
    act(() => result.current.start(60));

    expect(result.current.secondsLeft).toBe(60);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(59);
  });

  it("leaves no timer behind when the screen goes away", () => {
    const { result, unmount } = renderHook(() => useCountdown());

    act(() => result.current.start(60));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
