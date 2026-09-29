"use client";

import { useRef } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

/**
 * A yes/no question that interrupts, e.g. "discard what you typed?". Focus starts on the safe
 * choice, and every way out other than the confirm button (Escape, ✕, a press outside) counts as
 * cancelling, so nothing is lost by accident.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="compact"
      role="alertdialog"
      initialFocus={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2">{message}</p>
    </Modal>
  );
}
