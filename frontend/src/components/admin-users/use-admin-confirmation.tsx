"use client";

import { useCallback, useState } from "react";
import { CONFIRMATION_MINUTES, type SensitiveAction } from "@/lib/admin-users-api";
import { AdminCodePrompt } from "./admin-code-prompt";

interface LiveConfirmation {
  id: string;
  /** As epoch milliseconds, so a 15-minute rule is one comparison at the next action. */
  expiresAt: number;
}

interface Asking {
  action: SensitiveAction;
  run: (confirmationId: string) => void;
}

/**
 * The one confirmation a Super Admin gives before a role change or a deactivation. The first
 * sensitive action opens the prompt; once it is accepted, later ones go straight through until
 * the 15 minutes are up, whichever of the two actions they are (AC 11).
 */
export function useAdminConfirmation() {
  const [live, setLive] = useState<LiveConfirmation | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);

  const withConfirmation = useCallback(
    (action: SensitiveAction, run: (confirmationId: string) => void) => {
      if (live && live.expiresAt > Date.now()) {
        run(live.id);
        return;
      }
      setAsking({ action, run });
    },
    [live],
  );

  function confirmed(confirmationId: string, expiresAt: string) {
    const moment = Date.parse(expiresAt);
    setLive({
      id: confirmationId,
      expiresAt: Number.isNaN(moment)
        ? Date.now() + CONFIRMATION_MINUTES * 60_000
        : moment,
    });

    const ask = asking;
    setAsking(null);
    ask?.run(confirmationId);
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
