import { act, fireEvent, render, screen } from "@testing-library/react";
import { Toast, TOAST_DURATION_MS } from "./toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces its message politely", () => {
    render(<Toast message="Konten berhasil ditambahkan." onDismiss={vi.fn()} />);

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Konten berhasil ditambahkan.");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("dismisses itself after four seconds, not before", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Tersimpan" onDismiss={onDismiss} />);

    expect(TOAST_DURATION_MS).toBe(4000);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("can be closed right away with its button", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Tersimpan" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Tutup notifikasi" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not fire after it has been removed", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="Tersimpan" onDismiss={onDismiss} />);

    unmount();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps its countdown when the parent re-renders with a new callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Toast message="Tersimpan" onDismiss={first} />);

    act(() => vi.advanceTimersByTime(3000));
    rerender(<Toast message="Tersimpan" onDismiss={second} />);
    act(() => vi.advanceTimersByTime(1000));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
