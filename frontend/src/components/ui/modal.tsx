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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      data-testid="modal-backdrop"
      // The backdrop is a convenience for pointer users; Escape and the close button are the
      // accessible paths, so this element stays out of the keyboard flow on purpose.
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full max-w-[640px] overflow-y-auto rounded-[10px] border border-line bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-[18px]">
          <h2 className="text-[15px]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3.5 p-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
