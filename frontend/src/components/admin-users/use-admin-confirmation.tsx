"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { CONFIRMATION_MINUTES, type SensitiveAction } from "@/lib/admin-users-api";
import { AdminCodePrompt } from "./admin-code-prompt";

interface Asking {
  action: SensitiveAction;
  run: () => void;
  /** Lets the caller undo its own waiting (a shut Simpan) when the prompt is closed unconfirmed. */
  onCancel?: () => void;
}

/** What a caller hands over: the action, what to run once confirmed, and what to undo if not. */
export type WithConfirmation = (
  action: SensitiveAction,
  run: () => void,
  onCancel?: () => void,
) => void;

/** Epoch milliseconds the session stays confirmed until, or null before any code. */
type LiveUntil = [number | null, Dispatch<SetStateAction<number | null>>];

const SharedConfirmation = createContext<LiveUntil | null>(null);

/**
 * Holds the one confirmation for the whole Pengguna Admin page. The backend confirms the session,
 * not a screen, so a code entered in Tambah Admin also covers the rows for the same 15 minutes.
 */
export function AdminConfirmationProvider({ children }: { children: ReactNode }) {
  const live = useState<number | null>(null);
  return <SharedConfirmation.Provider value={live}>{children}</SharedConfirmation.Provider>;
}

/**
 * The one confirmation a Super Admin gives before a sensitive change. The first one opens the
 * prompt; once the code is accepted the backend holds this session as confirmed, so later ones go
 * straight through until the 15 minutes are up, whichever action they are (AC 11). The time kept
 * here only spares a prompt the backend would not need; the backend still decides. Under
 * AdminConfirmationProvider every part of the page reads the same time; without it, the hook
 * keeps its own.
 */
export function useAdminConfirmation() {
  const own = useState<number | null>(null);
  const [liveUntil, setLiveUntil] = useContext(SharedConfirmation) ?? own;
  const [asking, setAsking] = useState<Asking | null>(null);

  const withConfirmation = useCallback<WithConfirmation>(
    (action, run, onCancel) => {
      if (liveUntil !== null && liveUntil > Date.now()) {
        run();
        return;
      }
      setAsking({ action, run, onCancel });
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
      onCancel={() => {
        setAsking(null);
        asking.onCancel?.();
      }}
    />
  ) : null;

  return { withConfirmation, prompt };
}
