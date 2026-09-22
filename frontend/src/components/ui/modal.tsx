"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * A dialog with the three ways out people expect: the close button, Escape,
 * and a click on the backdrop. Focus moves in on open, cannot Tab out to the
 * page behind, and returns to whatever opened it on close.
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Read fresh on each key: the footer and body swap contents while the detail
    // loads, so a list captured on open would go stale.
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // The container, not the first control: screen readers then announce the
    // dialog and its title before the user starts tabbing through it.
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const index = active ? items.indexOf(active) : -1;

      // index === -1 means focus is on the container itself, so Tab enters at the
      // top and Shift+Tab enters at the bottom. Both ends wrap.
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && (index === -1 || index === items.length - 1)) {
        event.preventDefault();
        items[0].focus();
      }
    };

    // Dismiss on a press that starts outside the dialog. Listening here rather than
    // putting onClick on the backdrop keeps the backdrop out of the accessibility tree:
    // it is scenery, not a control, and Escape and the close button are the real exits.
    // mousedown, not click, so the press that opened the dialog cannot immediately
    // close it again as it finishes bubbling.
    const onMouseDown = (event: MouseEvent) => {
      if (!dialog?.contains(event.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
      data-testid="modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="max-h-[88vh] w-full max-w-[640px] overflow-y-auto rounded-(--radius-panel) border border-rule bg-surface focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-[18px]">
          <h2 id={headingId} className="text-[15px]">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="cursor-pointer rounded-(--radius-control) border-none bg-transparent px-1 text-lg leading-none text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3.5 p-5">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-rule px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
