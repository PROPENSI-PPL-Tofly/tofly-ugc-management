"use client";

import { useEffect, useRef } from "react";

/**
 * Puts the cursor in the first code box whenever the boxes are ready to type into: on arrival, and
 * each time they unlock after a check or a resend. A disabled box cannot take focus, so the effect
 * waits for the render that enables them. Shared by the sign-in screen and the confirmation prompt.
 */
export function useFirstBoxFocus(ready: boolean) {
  const boxesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready) boxesRef.current?.querySelector("input")?.focus();
  }, [ready]);

  return boxesRef;
}
