"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Puts a "discard what you typed?" question in front of closing a form. Route every way out of
 * the form's modal (✕, Batal, Escape, a press outside) through `requestClose`: an untouched form
 * closes at once, a touched one asks first. Render `confirmDialog` after the form's own modal so
 * it stacks on top.
 */
export function useDiscardGuard({
  isDirty,
  onDiscard,
  title,
  message = "Data yang sudah diisi akan hilang.",
}: {
  isDirty: boolean;
  onDiscard: () => void;
  title: string;
  message?: string;
}): { requestClose: () => void; confirmDialog: ReactNode } {
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) setAsking(true);
    else onDiscard();
  }, [isDirty, onDiscard]);

  const confirmDialog = asking ? (
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel="Buang"
      cancelLabel="Lanjut mengisi"
      onConfirm={() => {
        setAsking(false);
        onDiscard();
      }}
      onCancel={() => setAsking(false)}
    />
  ) : null;

  return { requestClose, confirmDialog };
}
