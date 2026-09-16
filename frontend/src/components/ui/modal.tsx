"use client";

import { useEffect, type ReactNode } from "react";

/**
 * A dialog with the three ways out people expect: the close button, Escape, and a click on
 * the backdrop. Escape matters most — it is the first thing a keyboard user reaches for, and
 * a dialog that traps them is worse than no dialog.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      // The backdrop is a convenience for pointer users; Escape and the close button are the
      // accessible paths, so this element is presentational and stays out of the keyboard
      // flow on purpose.
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-5"
      data-testid="modal-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full max-w-[660px] overflow-y-auto rounded-[var(--radius-panel)] bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-base leading-none text-muted hover:bg-surface-low hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
