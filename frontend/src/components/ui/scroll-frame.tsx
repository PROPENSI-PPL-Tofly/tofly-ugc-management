"use client";

import type { ReactNode } from "react";

/**
 * Stub until the frame lands: the table passes straight through, with no scroll area and no
 * hint, so the tests that pin both run and fail on what is missing.
 */
export function ScrollFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
