"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Seconds left before something may happen again, counting down once a second to zero. One
 * interval per run, cleared at zero, on restart and when the component goes away.
 */
export function useCountdown(seconds: number): { secondsLeft: number; restart: () => void } {
  const [secondsLeft, setSecondsLeft] = useState(seconds);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let left = seconds;
    const timer = setInterval(() => {
      left -= 1;
      setSecondsLeft(left);
      if (left <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [run, seconds]);

  const restart = useCallback(() => {
    setSecondsLeft(seconds);
    setRun((count) => count + 1);
  }, [seconds]);

  return { secondsLeft, restart };
}
