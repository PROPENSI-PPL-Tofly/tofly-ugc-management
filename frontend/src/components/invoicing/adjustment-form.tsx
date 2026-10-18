"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { Modal } from "@/components/ui/modal";
import {
  REASON_MAX_LENGTH,
  validateAdjustment,
  type AdjustmentDraft,
  type AdjustmentErrors,
} from "@/lib/invoice-adjustment";
import { addInvoiceAdjustment } from "@/lib/invoice-actions.server";

/**
 * The manual adjustment form (PBI-12, subtask 12.2): an amount and a reason, both mandatory,
 * each mistake said below its own field in the backend's words. A refusal is shown in the form
 * and nothing closes until the server has accepted — the admin never sees an adjustment the
 * invoice does not have.
 */
export function AdjustmentForm({
  contractId,
  onClose,
  onMutated,
}: Readonly<{
  contractId: string;
  onClose: () => void;
  /** The adjustment was accepted; the invoice reads again. */
  onMutated: () => void;
}>) {
  const [draft, setDraft] = useState<AdjustmentDraft>({ amount: "", reason: "" });
  const [errors, setErrors] = useState<AdjustmentErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = validateAdjustment(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setRefusal(null);
    try {
      const outcome = await addInvoiceAdjustment(contractId, draft);
      if (outcome.ok) {
        onMutated();
        return;
      }
      // A 422 speaks per field; anything else speaks to the form as a whole.
      if (outcome.fieldErrors) {
        setErrors(outcome.fieldErrors);
      } else {
        setRefusal(outcome.message);
      }
    } catch {
      setRefusal("Permintaan tidak dapat diproses. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Tambah Penyesuaian"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            Tambahkan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-semibold">Nominal (Rp)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="mis. 200000 atau -100000"
            // The typed amount stays as typed; it is read only when submitted.
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5"
          />
          {errors.amount ? (
            <span role="alert" className="text-xs text-red-ink">
              {errors.amount}
            </span>
          ) : (
            <span className="text-xs text-muted">
              Kurang untuk mengurangi invoice, lebih untuk menambah.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-semibold">Alasan</span>
          <textarea
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            value={draft.reason}
            onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
            className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5"
          />
          <CharLimit
            id="adjustment-reason"
            length={Array.from(draft.reason).length}
            max={REASON_MAX_LENGTH}
          />
          {errors.reason ? (
            <span role="alert" className="text-xs text-red-ink">
              {errors.reason}
            </span>
          ) : null}
        </label>

        {refusal ? (
          <p role="alert" className="text-[13px] text-red-ink">
            {refusal}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
