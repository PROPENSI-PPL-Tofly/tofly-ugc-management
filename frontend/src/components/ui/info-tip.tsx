"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

/** How far an open bubble stays from the edge of the area it opens in, and from its icon, in pixels. */
const EDGE_MARGIN = 8;
const ICON_GAP = 6;

/**
 * Places an open bubble on the screen layer against its icon: 6px below it, lined up with the
 * icon's left edge (or its right edge for `end`), and kept 8px inside the window. Near the bottom
 * of the window it opens above the icon instead, when there is room there. Fixed to the screen,
 * no scrolling table or sheet it sits in can cut it off.
 */
export function placeBubble(bubble: HTMLElement, align: "start" | "end" = "start") {
  const icon = (bubble.parentElement as HTMLElement).getBoundingClientRect();
  const box = bubble.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;

  const wanted = align === "start" ? icon.left : icon.right - box.width;
  const left = Math.max(EDGE_MARGIN, Math.min(wanted, width - EDGE_MARGIN - box.width));

  const below = icon.bottom + ICON_GAP;
  const above = icon.top - ICON_GAP - box.height;
  const flip = below + box.height > height - EDGE_MARGIN && above >= EDGE_MARGIN;

  bubble.style.left = `${left}px`;
  bubble.style.top = `${flip ? above : below}px`;
  if (flip) bubble.dataset.above = "";
  else delete bubble.dataset.above;
}

/**
 * Fixed to the screen, an open bubble would stay put while its icon scrolls away: while `open`,
 * it is placed again on every scroll and resize.
 */
export function useBubbleFollow(
  bubble: RefObject<HTMLElement | null>,
  align: "start" | "end",
  open: boolean,
) {
  useEffect(() => {
    if (!open) return;
    function follow() {
      if (bubble.current) placeBubble(bubble.current, align);
    }
    document.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [bubble, align, open]);
}

/**
 * The ⓘ beside a label or heading that explains it. The explanation shows on hover, on
 * keyboard focus and on a tap, and closes on Escape, on leaving it or on a press elsewhere. It
 * is tied to the button through aria-describedby so a screen reader reads it too. `label`
 * names the button (what it explains); `align` says which edge of the icon the bubble lines up
 * with, so one near the right edge of a dialog does not run off it.
 *
 * Closed, the bubble takes no room: laid out but invisible, it once widened a creator's invoice
 * sheet on a phone so the sheet scrolled sideways. Opened, it is placed on the screen layer
 * against its icon, and follows it while the page scrolls.
 */
export function InfoTip({
  text,
  label,
  align = "start",
}: {
  /** Words, or a short layout of them such as one line per rule. */
  text: ReactNode;
  label: string;
  align?: "start" | "end";
}) {
  const tipId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // Open by focus or a tap; CSS shows the bubble under a pointer, which is tracked only so the
  // bubble can follow its icon while the page scrolls.
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Measured a frame after it opens, once hover, focus or a tap has shown it.
  function fitSoon() {
    requestAnimationFrame(() => {
      if (bubble.current) placeBubble(bubble.current, align);
    });
  }

  useBubbleFollow(bubble, align, shown || hovered);

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
    <span
      ref={root}
      className="group relative inline-flex align-middle"
      onPointerEnter={() => {
        setHovered(true);
        fitSoon();
      }}
      onPointerLeave={() => setHovered(false)}
    >
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
        // A press here would take focus off the button, and its blur would shut the bubble.
        onMouseDown={(event) => event.preventDefault()}
        // The bubble takes its own presses, so a tap on it neither shuts it nor reaches what
        // lies beneath; the strip above it bridges the 6px gap, so a pointer crossing from the
        // icon to the bubble never leaves the tip (below it once the bubble opens above).
        className={`fixed z-50 w-max before:absolute before:inset-x-0 before:-top-1.5 before:h-1.5 before:content-[''] data-above:before:top-auto data-above:before:-bottom-1.5 max-w-[260px] rounded-(--radius-control) bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-accent-ink group-hover:block ${shown ? "block" : "hidden"}`}
      >
        {text}
      </span>
    </span>
  );
}
