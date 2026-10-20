"use client";

import { useRef, type RefObject } from "react";

/**
 * The fade a sideways-scrolling row shows at each edge that hides more items, read from the
 * data-more attribute useScrollHint is to keep current.
 */
export const SCROLL_HINT =
  "data-[more=end]:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] data-[more=start]:[mask-image:linear-gradient(to_left,#000_calc(100%-2rem),transparent)] data-[more=both]:[mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%-2rem),transparent)]";

/**
 * Stub until the behaviour lands: hands back the row's ref but marks no edge and moves no item,
 * so the tests that pin both run and fail on what is missing.
 */
export function useScrollHint<T extends HTMLElement>(current?: string): RefObject<T | null> {
  void current;
  return useRef<T>(null);
}
