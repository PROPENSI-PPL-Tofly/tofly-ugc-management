"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The fade a sideways-scrolling row shows at each edge that hides more items: a soft 2rem
 * fall-off, not a banner. It reads data-more, which useScrollHint keeps current, so nothing
 * fades while every item fits.
 */
export const SCROLL_HINT =
  "data-[more=end]:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] data-[more=start]:[mask-image:linear-gradient(to_left,#000_calc(100%-2rem),transparent)] data-[more=both]:[mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%-2rem),transparent)]";

/** The item the row is on: the current page of a menu, or the selected tab. */
const CURRENT = '[aria-current]:not([aria-current="false"]), [aria-selected="true"]';

function moreOf(strip: HTMLElement): "start" | "end" | "both" | null {
  const start = strip.scrollLeft > 1;
  const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  if (start && end) return "both";
  if (start) return "start";
  return end ? "end" : null;
}

/**
 * For a row that scrolls sideways on a phone (the main menu, the status tabs): marks which edges
 * hide more items, for SCROLL_HINT to fade, and keeps the current item fully inside the row.
 * Only the row scrolls, never the page. `current` names the current item, so the row follows
 * when it changes.
 */
export function useScrollHint<T extends HTMLElement>(current?: string): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;

    // Written straight to the element: the hint is presentation, and a scroll should not
    // re-render the row.
    const update = () => {
      const more = moreOf(strip);
      if (more) strip.dataset.more = more;
      else delete strip.dataset.more;
    };

    update();
    strip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(strip);

    return () => {
      strip.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const strip = ref.current;
    const item = strip?.querySelector(CURRENT);
    if (!strip || !item) return;

    const row = strip.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.right > row.right) strip.scrollLeft += box.right - row.right;
    else if (box.left < row.left) strip.scrollLeft -= row.left - box.left;
  }, [current]);

  return ref;
}
