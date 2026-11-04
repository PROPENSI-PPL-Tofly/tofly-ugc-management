"use client";

import { useCallback, useEffect, useState } from "react";

/** Seconds left until something unlocks; `start` sets a new length and counts it down to 0. */
export function useCountdown(): { secondsLeft: number; start: (seconds: number) => void } {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const running = secondsLeft > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((left) => Math.max(0, left - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback((seconds: number) => setSecondsLeft(seconds), []);
  return { secondsLeft, start };
}
