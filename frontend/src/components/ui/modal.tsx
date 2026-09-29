"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const SIZES = {
  default: "max-w-[640px]",
  compact: "max-w-[420px]",
} as const;

/**
 * Whether this dialog is the one on top. A dialog opened over another (a "discard changes?"
 * question over a form) renders after it, so the last open dialog in document order is the top
 * one. Reading the DOM rather than keeping a registry means no shared state to leak between
 * renders or tests, and it holds however the dialogs are nested.
 */
function isTopDialog(dialog: HTMLElement): boolean {
  const open = document.querySelectorAll("[data-modal-dialog]");
  return open[open.length - 1] === dialog;
}

/**
 * A dialog with the three ways out people expect: the close button, Escape,
 * and a click on the backdrop. Focus moves in on open, cannot Tab out to the
 * page behind, and returns to whatever opened it on close. When dialogs stack,
 * only the top one answers keys and outside presses.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "default",
  role = "dialog",
  initialFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  /** "alertdialog" for a question that interrupts, such as confirming a discard. */
  role?: "dialog" | "alertdialog";
  /** Where focus lands on open; the dialog container itself when not given. */
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Read through a ref so a parent re-render with a fresh callback does not re-run the effect,
  // which would bounce focus to the opener and back while someone is typing.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  const firstFocus = useRef(initialFocus);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Set by the time effects run: the dialog element renders unconditionally.
    const dialog = dialogRef.current as HTMLDivElement;

    // Read fresh on each key: the footer and body swap contents while the detail
    // loads, so a list captured on open would go stale.
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // A dialog stacked inside this one keeps its own controls.
        (element) => element.closest("[data-modal-dialog]") === dialog,
      );

    // The container by default, not the first control: screen readers then announce the
    // dialog and its title before the user starts tabbing through it.
    (firstFocus.current?.current ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialog)) return;

      if (event.key === "Escape") {
        close.current();
        return;
      }

      if (event.key !== "Tab") return;

      // Never empty: the close button in the header is always there.
      const items = focusable();
      const index = items.indexOf(document.activeElement as HTMLElement);

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
      if (isTopDialog(dialog) && !dialog.contains(event.target as Node)) close.current();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
      data-testid="modal-backdrop"
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        data-modal-dialog=""
        className={`max-h-[88vh] w-full ${SIZES[size]} overflow-y-auto rounded-(--radius-panel) border border-rule bg-surface focus:outline-none`}
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
          <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
