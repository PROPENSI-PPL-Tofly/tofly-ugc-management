"use client";

import { useState } from "react";
import { CREATOR_REFUSALS } from "@/lib/creator-invoice";
import type { CreatorRefusal } from "@/lib/creator-invoice-actions.server";

/**
 * The one way a creator's move is sent from the page, shared by the acknowledge/confirm dialog
 * and the comment form: busy while it is on its way, so it cannot be sent twice (OWASP A06); the
 * server's refusal kept to show; and a failure on the way read as "try again" rather than
 * thrown at the creator (OWASP A10). `onAccepted` runs only when the server accepted the move,
 * with what it answered.
 */
export function useCreatorMove(): {
  busy: boolean;
  refusal: string | null;
  run: <Accepted extends { ok: true }>(
    send: () => Promise<Accepted | CreatorRefusal>,
    onAccepted: (accepted: Accepted) => void,
  ) => Promise<void>;
  clear: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function run<Accepted extends { ok: true }>(
    send: () => Promise<Accepted | CreatorRefusal>,
    onAccepted: (accepted: Accepted) => void,
  ) {
    setBusy(true);
    setRefusal(null);
    try {
      const outcome = await send();
      if (outcome.ok) {
        onAccepted(outcome);
        return;
      }
      setRefusal(outcome.message);
    } catch {
      setRefusal(CREATOR_REFUSALS.GENERIC);
    } finally {
      setBusy(false);
    }
  }

  return { busy, refusal, run, clear: () => setRefusal(null) };
}
