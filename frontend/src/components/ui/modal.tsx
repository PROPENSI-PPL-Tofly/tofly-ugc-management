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

// Where the dialog sits. "side" is a sheet docked to the right edge at full height, for detail
// that is read next to the list it was opened from; it has its own width, so `size` is ignored.
// A centred dialog scrolls as a whole; a sheet keeps its header in place and scrolls its body,
// so the subject stays in view however long the detail under it runs.
const PLACEMENTS = {
  center: {
    backdrop: "items-center justify-center p-5",
    dialog: "max-h-[88vh] overflow-y-auto rounded-(--radius-panel) border",
    header: "py-[18px]",
    title: "text-[15px]",
    body: "",
  },
  side: {
    backdrop: "justify-end",
    dialog: "flex h-full max-w-[520px] flex-col border-l shadow-sheet animate-sheet-in",
    header: "pb-4 pt-5",
    title: "text-lg",
    body: "min-h-0 flex-1 overflow-y-auto",
  },
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
  placement = "center",
  eyebrow,
  meta,
  role = "dialog",
  initialFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  placement?: keyof typeof PLACEMENTS;
  /** A short line above the title saying where this sits, such as a breadcrumb. */
  eyebrow?: string;
  /** Facts about the subject shown under the title, in the header. */
  meta?: ReactNode;
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
      if (isTopDialog(dialog) && !dialog.contains(event.target as Node)) {
        // The browser's own mousedown would move focus to whatever was pressed (the page body)
        // after closing has already handed it back to the opener.
        event.preventDefault();
        close.current();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      opener?.focus();
    };
  }, []);

  const layout = PLACEMENTS[placement];
  const width = placement === "side" ? "" : SIZES[size];

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-ink/40 ${layout.backdrop}`}
      data-testid="modal-backdrop"
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        data-modal-dialog=""
        className={`w-full ${width} ${layout.dialog} border-rule bg-surface focus:outline-none`}
      >
        <div className={`border-b border-rule px-5 ${layout.header}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {eyebrow ? (
                <p data-testid="modal-eyebrow" className="mb-1 text-xs text-muted">
                  {eyebrow}
                </p>
              ) : null}

              <h2 id={headingId} className={layout.title}>
                {title}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog"
              className="cursor-pointer rounded-(--radius-control) border-none bg-transparent px-1 text-lg leading-none text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>

          {meta ? (
            <div
              data-testid="modal-meta"
              className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-muted"
            >
              {meta}
            </div>
          ) : null}
        </div>

        <div className={`flex flex-col gap-3.5 p-5 ${layout.body}`}>{children}</div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
