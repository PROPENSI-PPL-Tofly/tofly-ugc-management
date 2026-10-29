"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export const TOAST_DURATION_MS = 4000;

/**
 * A short confirmation pinned to the bottom of the viewport, so it stays visible while the page
 * underneath reloads. Give it a new `key` for each message: that restarts the countdown even when
 * the same text is shown twice in a row.
 */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  // Read through a ref so a parent re-render with a fresh callback does not restart the countdown.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm animate-toast-in items-center gap-3 rounded-(--radius-control) border border-rule bg-surface py-2 pl-4 pr-2 text-[13px] text-ink shadow-whisper sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-green" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        aria-label="Tutup notifikasi"
        onClick={onDismiss}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-(--radius-control) text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

/**
 * The state every surface that confirms something keeps: the message on screen, and a counter
 * used as the Toast's key so a second confirmation remounts it and restarts its countdown, even
 * with the same text. `show` is stable, so it is safe in effects and callbacks; `toast` is the
 * element to render beside the surface (never inside a part that reloads, or it would vanish).
 */
export function useToast(): { show: (message: string) => void; toast: ReactNode } {
  const [current, setCurrent] = useState<{ id: number; message: string } | null>(null);
  const show = useCallback((message: string) => {
    setCurrent((last) => ({ id: (last?.id ?? 0) + 1, message }));
  }, []);

  return {
    show,
    toast: current ? (
      <Toast key={current.id} message={current.message} onDismiss={() => setCurrent(null)} />
    ) : null,
  };
}
