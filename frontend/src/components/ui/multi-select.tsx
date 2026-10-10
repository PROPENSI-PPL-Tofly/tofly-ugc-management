"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

const TRIGGER =
  "cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-2";

const POPUP =
  "absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-(--radius-panel) border border-rule bg-surface p-2 shadow-lg";

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-rule bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2";

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
  const listId = useId();
  const summary = selected.length === 0 ? "Semua" : `${selected.length} dipilih`;
  const labelFor = (value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

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
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((picked) => picked !== value)
        : [...selected, value],
    );
  }

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className={TRIGGER}
      >
        {label}: {summary}
      </button>

      {open ? (
        <div id={listId} role="group" aria-label={label} className={POPUP}>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="size-3.5 accent-(--accent)"
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}

      {selected.map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`Hapus filter ${label}: ${labelFor(value)}`}
          onClick={() => toggle(value)}
          className={`${CHIP} cursor-pointer hover:border-ink-2`}
        >
          <span className="max-w-40 truncate">{labelFor(value)}</span>
          <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}
