"use client";

import { useEffect } from "react";

const ACTIVITY_REFRESH_MS = 5 * 60 * 1000;

/** Keep the browser cookie's expiry in step with server renewal during active use. */
export function SessionActivity() {
  useEffect(() => {
    let lastActivity = Date.now();
    const noteActivity = () => {
      lastActivity = Date.now();
    };
    const renew = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastActivity < ACTIVITY_REFRESH_MS
      ) {
        void fetch("/api/auth/session/activity", { method: "POST" }).catch(() => {
          // A failed activity pulse must not disrupt the page; the next request will retry.
        });
      }
    };

    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((event) =>
      document.addEventListener(event, noteActivity, { passive: true }),
    );
    renew();
    const timer = window.setInterval(renew, ACTIVITY_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
      events.forEach((event) => document.removeEventListener(event, noteActivity));
    };
  }, []);

  return null;
}
