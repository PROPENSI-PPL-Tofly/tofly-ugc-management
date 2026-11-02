"use client";

import type { ReactNode } from "react";
import { useScrollHint } from "./use-scroll-hint";

// A 12px shade from the ink colour at 15% to nothing, over the frame's edge but not part of the
// table: the figures under it stay fully drawn, and it shows only while that edge hides more.
const SHADE =
  "pointer-events-none absolute inset-y-0 w-3 from-ink/15 to-transparent opacity-0 transition-opacity";

/**
 * The sideways scroll area around a list table. Where the table is wider than the page (at
 * 1024px most are), a narrow shade falls over the edge that hides more columns; nothing shows
 * while the table fits. The table itself is never faded, so a figure at the edge stays legible.
 * A client component, so a server-rendered table can sit in it too.
 */
export function ScrollFrame({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useScrollHint<HTMLDivElement>();

  return (
    <div className="relative">
      <div ref={ref} data-scroll-frame="" className="peer relative overflow-x-auto">
        {children}
      </div>
      <span
        aria-hidden="true"
        data-scroll-shade="start"
        className={`${SHADE} left-0 bg-linear-to-r peer-data-[more=start]:opacity-100 peer-data-[more=both]:opacity-100`}
      />
      <span
        aria-hidden="true"
        data-scroll-shade="end"
        className={`${SHADE} right-0 bg-linear-to-l peer-data-[more=end]:opacity-100 peer-data-[more=both]:opacity-100`}
      />
    </div>
  );
}
