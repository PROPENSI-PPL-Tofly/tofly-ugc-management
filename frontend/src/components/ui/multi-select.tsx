"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

// A pill, as the prototype draws every filter: a quiet label, the value in strong type, and a
// caret that says there is more behind it.
const TRIGGER =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-surface px-3 text-[12.5px] text-ink hover:border-ink";

const CARET = "ml-0.5 size-1.5 -translate-y-px rotate-45 border-b-[1.6px] border-r-[1.6px] border-muted";

const OPTION =
  "flex cursor-pointer items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2";

const CHECKBOX = "size-3.5 accent-accent";

const POPUP =
  "absolute left-0 top-full z-20 mt-1.5 max-h-64 w-60 overflow-y-auto rounded-(--radius-panel) border border-rule bg-surface p-2 shadow-lg";

/** How far a popup stays from the edge of the window, in pixels. */
const WINDOW_MARGIN = 8;

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-rule bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2";

/**
 * A filter shown as a chip that takes itself off when pressed. The multi-select's picks use it,
 * and so does the folded phone filter bar's row of active filters.
 */
export function FilterChip({
  text,
  removeLabel,
  onRemove,
  wrap = false,
}: Readonly<{
  text: string;
  removeLabel: string;
  onRemove: () => void;
  /** Wraps a long text instead of cutting it off, where the chip is all that names the filter. */
  wrap?: boolean;
}>) {
  return (
    <button
      type="button"
      aria-label={removeLabel}
      onClick={onRemove}
      className={`${CHIP} cursor-pointer hover:border-ink-2`}
    >
      <span className={wrap ? "min-w-0 text-left" : "max-w-40 truncate"}>{text}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}

/**
 * A multi-select whose choices read as chips: the popup holds the checkboxes, and each pick
 * becomes a chip the admin can drop on its own, so narrowing one list never means starting
 * the whole filter over. Shared vocabulary for every filter bar that needs more than one
 * pick (Content Plan, and Task Saya when it wants the same).
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: Readonly<{
  label: string;
  options: readonly MultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelFor = (value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

  /** Nothing picked reads "Semua", one pick reads as itself, more are counted. */
  function summary(): string {
    if (selected.length === 0) return "Semua";
    return selected.length === 1 ? labelFor(selected[0]) : `${selected.length} dipilih`;
  }

  // The popup follows the pointer and the keyboard: a click anywhere but on it closes it,
  // and Escape sends it away without hunting for the trigger again.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // The popup held focus and is about to unmount; without this a keyboard user is dropped
      // to the top of the page. A click outside keeps focus where the press landed instead.
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The popup opens from the trigger's left edge. On a narrow window that can carry it past
  // the right edge, so it is measured before it is painted and pulled back by the overhang,
  // though never further than the left edge allows. It runs after every render, not only on
  // opening: a pick adds a chip, the chip can wrap the trigger onto another row, and an
  // offset measured for the old place would then push the popup off the other side.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    popup.style.left = "";
    const box = popup.getBoundingClientRect();
    const overhang = box.right - (document.documentElement.clientWidth - WINDOW_MARGIN);
    const pull = Math.min(overhang, box.left - WINDOW_MARGIN);
    if (pull > 0) popup.style.left = `${-pull}px`;
  });

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((picked) => picked !== value)
        : [...selected, value],
    );
  }

  /** Back to "everything". Already there, it is no change, and the page is not asked to move. */
  function clear() {
    if (selected.length > 0) onChange([]);
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      {/* The popup hangs from the trigger alone. The chips wrap onto more rows as picks are
          added, and a popup anchored to the whole box would open under the last of them. */}
      <span className="relative inline-flex">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className={`${TRIGGER} ${open ? "border-ink" : "border-rule"}`}
        >
          <span className="text-muted">{label}:</span>{" "}
          <b className="max-w-48 truncate font-semibold">{summary()}</b>
          <span aria-hidden="true" className={CARET} />
        </button>

        {open ? (
          <div ref={popupRef} id={listId} role="group" aria-label={label} className={POPUP}>
            {/* The way back to "everything", without unticking each pick in turn. */}
            <label className={`${OPTION} mb-1 border-b border-rule pb-2`}>
              <input
                type="checkbox"
                checked={selected.length === 0}
                onChange={clear}
                className={CHECKBOX}
              />
              Semua
            </label>

            {options.map((option) => (
              <label key={option.value} className={OPTION}>
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className={CHECKBOX}
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : null}
      </span>

      {selected.map((value) => (
        <FilterChip
          key={value}
          text={labelFor(value)}
          removeLabel={`Hapus filter ${label}: ${labelFor(value)}`}
          onRemove={() => toggle(value)}
        />
      ))}
    </div>
  );
}
