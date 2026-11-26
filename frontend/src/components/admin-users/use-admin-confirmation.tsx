"use client";

import { useCallback, useState } from "react";
import { CONFIRMATION_MINUTES, type SensitiveAction } from "@/lib/admin-users-api";
import { AdminCodePrompt } from "./admin-code-prompt";

interface Asking {
  action: SensitiveAction;
  run: () => void;
}

/**
 * The one confirmation a Super Admin gives before a sensitive change. The first one opens the
 * prompt; once the code is accepted the backend holds this session as confirmed, so later ones go
 * straight through until the 15 minutes are up, whichever action they are (AC 11). The time kept
 * here only spares a prompt the backend would not need; the backend still decides.
 */
export function useAdminConfirmation() {
  /** Epoch milliseconds, so the 15-minute rule is one comparison at the next action. */
  const [liveUntil, setLiveUntil] = useState<number | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);

  const withConfirmation = useCallback(
    (action: SensitiveAction, run: () => void) => {
      if (liveUntil !== null && liveUntil > Date.now()) {
        run();
        return;
      }
      setAsking({ action, run });
    },
    [liveUntil],
  );

  function confirmed(expiresAt: string) {
    const moment = Date.parse(expiresAt);
    setLiveUntil(Number.isNaN(moment) ? Date.now() + CONFIRMATION_MINUTES * 60_000 : moment);

    const ask = asking;
    setAsking(null);
    ask?.run();
  }

  const prompt = asking ? (
    <AdminCodePrompt
      action={asking.action}
      onConfirmed={confirmed}
      onCancel={() => setAsking(null)}
    />
  ) : null;

  return { withConfirmation, prompt };
}
