"use client";

import { useRef } from "react";
import { Button } from "./button";
import type { Variant } from "./button-classes";
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
  confirmVariant = "danger",
  details,
}: {
  title: string;
  message: string;
  /** Labelled facts under the message, such as the old and the new deadline. */
  details?: readonly (readonly [string, string])[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Red for throwing work away (the default); the brand blue for a step forward that is final. */
  confirmVariant?: Variant;
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
          <Button type="button" variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2">{message}</p>

      {details?.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-(--radius-control) bg-surface-2 px-3 py-2.5 text-[13px]">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Modal>
  );
}
