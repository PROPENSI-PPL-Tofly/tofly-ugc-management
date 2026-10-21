"use client";

import type { ReactNode } from "react";
import { SCROLL_HINT, useScrollHint } from "./use-scroll-hint";

/**
 * The sideways scroll area around a list table. Where the table is wider than the page (at
 * 1024px most are), the edge that hides more columns fades, as the phone menu and status tabs
 * do; nothing fades while the table fits. A client component, so a server-rendered table can
 * sit in it too.
 */
export function ScrollFrame({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useScrollHint<HTMLDivElement>();

  return (
    <div ref={ref} data-scroll-frame="" className={`relative overflow-x-auto ${SCROLL_HINT}`}>
      {children}
    </div>
  );
}
