"use client";

import { useId, useRef } from "react";

/** How far an open bubble stays from the edge of the area it opens in, in pixels. */
const EDGE_MARGIN = 8;

/** The nearest ancestor that scrolls or clips, whose edges a bubble inside it must keep within. */
function boundingArea(bubble: HTMLElement): DOMRect | null {
  for (let node = bubble.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if ([overflowX, overflowY].some((value) => value !== "visible")) {
      return node.getBoundingClientRect();
    }
  }
  return null;
}

/**
 * Moves an open bubble back inside its scrolling area and the window: a start-aligned one is
 * pulled left by its overhang, an end-aligned one pushed right, never past the other edge.
 */
function fit(bubble: HTMLElement) {
  bubble.style.left = "";
  bubble.style.right = "";

  const box = bubble.getBoundingClientRect();
  const area = boundingArea(bubble);
  const right = Math.min(document.documentElement.clientWidth, area?.right ?? Infinity) - EDGE_MARGIN;
  const left = Math.max(0, area?.left ?? 0) + EDGE_MARGIN;

  const pull = Math.min(box.right - right, box.left - left);
  if (pull > 0) {
    bubble.style.left = `${-pull}px`;
    return;
  }
  const push = Math.min(left - box.left, right - box.right);
  if (push > 0) bubble.style.right = `${-push}px`;
}

/**
 * The ⓘ beside a label or heading that explains it. The explanation shows on hover and on
 * keyboard focus, and is tied to the button through aria-describedby so a screen reader reads
 * it too. `label` names the button (what it explains); `align` says which edge of the icon the
 * bubble lines up with, so one near the right edge of a dialog does not run off it.
 *
 * Closed, the bubble takes no room: laid out but invisible, it once widened a creator's invoice
 * sheet on a phone so the sheet scrolled sideways. Opened, it is measured and moved back inside
 * the area it opens in, wherever the icon sits.
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
  const bubble = useRef<HTMLSpanElement>(null);

  // Measured a frame after it opens, once hover or focus has shown it.
  function open() {
    requestAnimationFrame(() => {
      if (bubble.current) fit(bubble.current);
    });
  }

  return (
    <span className="group relative inline-flex align-middle" onFocus={open} onPointerEnter={open}>
      <button
        type="button"
        aria-describedby={tipId}
        className="grid size-4 cursor-help place-items-center rounded-full text-[13px] leading-none text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">ⓘ</span>
        {/* Text, not aria-label: a label on this button would also answer for the field it sits by. */}
        <span className="sr-only">{label}</span>
      </button>
      <span
        ref={bubble}
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-10 mt-1.5 hidden w-max max-w-[260px] rounded-(--radius-control) bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-accent-ink group-focus-within:block group-hover:block ${align === "end" ? "right-0" : "left-0"}`}
      >
        {text}
      </span>
    </span>
  );
}
