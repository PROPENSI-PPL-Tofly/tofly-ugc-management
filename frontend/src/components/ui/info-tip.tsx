"use client";

import { useId, type SyntheticEvent } from "react";

/** How far the bubble stays from the edge of the window, in pixels. */
const WINDOW_MARGIN = 8;

/**
 * The ⓘ beside a label or heading that explains it. The explanation shows on hover and on
 * keyboard focus, and is tied to the button through aria-describedby so a screen reader reads
 * it too. `label` names the button (what it explains); `align` says which edge of the icon the
 * bubble lines up with, so one near the right edge of a dialog does not run off it.
 */
export function InfoTip({
  text,
  label,
  align = "start",
}: {
  text: string;
  label: string;
  align?: "start" | "end";
}) {
  const tipId = useId();

  // Where the icon sits decides whether the bubble fits: on a phone a card in the right column
  // carried it past the window's edge. It is measured where it opens, below the icon, each time
  // it opens, then moved back inside by its overhang, though never past the opposite edge.
  function place(event: SyntheticEvent<HTMLSpanElement>) {
    const icon = event.currentTarget;
    const bubble = icon.lastElementChild as HTMLElement;

    bubble.style.transform = "";
    const box = bubble.getBoundingClientRect();
    const { clientWidth } = document.documentElement;

    let x = 0;
    if (box.right > clientWidth - WINDOW_MARGIN) {
      x = -Math.min(box.right - (clientWidth - WINDOW_MARGIN), box.left - WINDOW_MARGIN);
    } else if (box.left < WINDOW_MARGIN) {
      x = Math.min(WINDOW_MARGIN - box.left, clientWidth - WINDOW_MARGIN - box.right);
    }

    if (x !== 0) bubble.style.transform = `translate(${x}px, 0px)`;
  }

  return (
    <span
      onPointerEnter={place}
      onFocus={place}
      className="group relative inline-flex align-middle"
    >
      <button
        type="button"
        aria-describedby={tipId}
        className="grid size-4 cursor-help place-items-center rounded-full text-[13px] leading-none text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">ⓘ</span>
        {/* Text, not aria-label: a label on this button would also answer for the field it sits by. */}
        <span className="sr-only">{label}</span>
      </button>
      {/* The last child: place() finds the bubble there. */}
      <span
        id={tipId}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-10 mt-1.5 w-max max-w-[260px] rounded-(--radius-control) bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-accent-ink opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${align === "end" ? "right-0" : "left-0"}`}
      >
        {text}
      </span>
    </span>
  );
}
