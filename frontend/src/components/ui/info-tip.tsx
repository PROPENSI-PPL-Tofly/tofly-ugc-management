"use client";

import { useEffect, useId, useRef, useState } from "react";

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
 * Moves an open bubble back inside its scrolling area and the window: pulled left by its
 * overhang past the right edge, or pushed right by its overhang past the left, never past the
 * other edge. It is moved by the edge it hangs from alone; setting the other as well
 * over-constrains it, and the browser then keeps `left` whatever the alignment.
 */
function fit(bubble: HTMLElement, align: "start" | "end") {
  bubble.style.left = "";
  bubble.style.right = "";

  const box = bubble.getBoundingClientRect();
  const area = boundingArea(bubble);
  const right = Math.min(document.documentElement.clientWidth, area?.right ?? Infinity) - EDGE_MARGIN;
  const left = Math.max(0, area?.left ?? 0) + EDGE_MARGIN;

  const pull = Math.min(box.right - right, box.left - left);
  const push = Math.min(left - box.left, right - box.right);
  let shift = 0;
  if (pull > 0) shift = -pull;
  else if (push > 0) shift = push;
  if (shift === 0) return;

  if (align === "start") bubble.style.left = `${shift}px`;
  else bubble.style.right = `${-shift}px`;
}

/**
 * The ⓘ beside a label or heading that explains it. The explanation shows on hover, on
 * keyboard focus and on a tap, and closes on Escape, on leaving it or on a press elsewhere. It
 * is tied to the button through aria-describedby so a screen reader reads it too. `label`
 * names the button (what it explains); `align` says which edge of the icon the bubble lines up
 * with, so one near the right edge of a dialog does not run off it.
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
  const root = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // Open by focus or a tap; hover needs no state, CSS shows the bubble under a pointer.
  const [shown, setShown] = useState(false);

  // Measured a frame after it opens, once hover, focus or a tap has shown it.
  function fitSoon() {
    requestAnimationFrame(() => {
      if (bubble.current) fit(bubble.current, align);
    });
  }

  function show() {
    setShown(true);
    fitSoon();
  }

  // A tap that does not focus the button leaves no blur to close on: a press elsewhere does.
  useEffect(() => {
    if (!shown) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setShown(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [shown]);

  return (
    <span ref={root} className="group relative inline-flex align-middle" onPointerEnter={fitSoon}>
      {/* The icon is 16px; the ::before around it widens the press to 24px, 44px under a finger. */}
      <button
        type="button"
        aria-describedby={tipId}
        onFocus={show}
        onClick={show}
        onBlur={() => setShown(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setShown(false);
        }}
        className="relative grid size-4 cursor-help place-items-center rounded-full text-[13px] leading-none text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-ink pointer-coarse:before:-inset-3.5"
      >
        <span aria-hidden="true">ⓘ</span>
        {/* Text, not aria-label: a label on this button would also answer for the field it sits by. */}
        <span className="sr-only">{label}</span>
      </button>
      <span
        ref={bubble}
        id={tipId}
        role="tooltip"
        // The bubble takes its own presses, so a tap on it neither shuts it nor reaches what
        // lies beneath; the strip above it bridges the 6px gap, so a pointer crossing from the
        // icon to the bubble never leaves the tip.
        className={`absolute top-full z-10 mt-1.5 w-max before:absolute before:inset-x-0 before:-top-1.5 before:h-1.5 before:content-[''] max-w-[260px] rounded-(--radius-control) bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-accent-ink group-hover:block ${shown ? "block" : "hidden"} ${align === "end" ? "right-0" : "left-0"}`}
      >
        {text}
      </span>
    </span>
  );
}
