"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ALERT, FIELD, FIELD_ERROR, NUMERIC_INPUT, REQUIRED_MARK } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  MAX_BUFFER_DAYS,
  MIN_BUFFER_DAYS,
  bufferChangeDetails,
  checkBufferDays,
  saveDeadlineBuffer,
  type BufferSaver,
} from "@/lib/deadline-buffer";

/**
 * "Atur Buffer Deadline" (PBI-23, 23.9): a Super Admin sets the one buffer every date picker
 * counts with. The value is checked at the field, confirmed with its old and new value, then
 * saved; the API still decides, and its refusal is shown where it belongs.
 */
export function DeadlineBufferModal({
  current,
  onClose,
  onSaved,
  saveAction = saveDeadlineBuffer,
}: Readonly<{
  current: number;
  onClose: () => void;
  onSaved: (bufferDays: number) => void;
  saveAction?: BufferSaver;
}>) {
  const [typed, setTyped] = useState(String(current));
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const errorId = useId();
  const noteId = useId();

  const unchanged = typed === String(current);
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: !unchanged,
    onDiscard: onClose,
    title: "Batalkan perubahan buffer?",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = checkBufferDays(typed);
    setFieldError(problem);
    setGeneralError("");
    // Only a value the API could take is worth a confirmation.
    if (!problem) setConfirming(true);
  }

  async function confirm() {
    setConfirming(false);
    setSaving(true);
    const result = await saveAction(Number(typed));
    setSaving(false);

    if (result.ok) {
      onSaved(result.bufferDays);
      return;
    }
    // A message about the value goes beside the field; anything else is for the whole form.
    if (result.fieldError) {
      setFieldError(result.fieldError);
    } else {
      setGeneralError(result.message);
    }
  }

  const shown = checkBufferDays(typed) ? current : Number(typed);

  return (
    <>
      <Modal
        title="Atur Buffer Deadline"
        onClose={requestClose}
        size="compact"
        footer={
          <>
            <Button type="button" onClick={requestClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="deadline-buffer-form" variant="accent" disabled={unchanged || saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </>
        }
      >
        <form id="deadline-buffer-form" noValidate onSubmit={submit} className="flex flex-col gap-3">
          <p id={noteId} className="text-[13px] text-ink-2">
            Berlaku untuk jadwal baru: deadline paling cepat {shown} hari setelah hari ini atau
            tanggal mulai kontrak, dan paling lambat {shown} hari sebelum akhir kontrak.
          </p>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className={`font-semibold ${REQUIRED_MARK}`}>Buffer deadline (hari)</span>
            <input
              {...NUMERIC_INPUT}
              className={FIELD}
              required
              value={typed}
              disabled={saving}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              onChange={(event) => {
                // Kept as typed: dropping a minus or a decimal point would turn -3 into 3 and 1.5
                // into 15 without a word; checkBufferDays refuses them instead.
                setTyped(event.target.value);
                setFieldError(undefined);
              }}
            />
          </label>
          {fieldError ? (
            <span id={errorId} className={FIELD_ERROR}>
              {fieldError}
            </span>
          ) : (
            <span className="text-xs text-muted">
              Antara {MIN_BUFFER_DAYS} dan {MAX_BUFFER_DAYS} hari.
            </span>
          )}

          {generalError ? (
            <p role="alert" className={ALERT}>
              {generalError}
            </p>
          ) : null}
        </form>
      </Modal>

      {confirming ? (
        <ConfirmDialog
          title="Ubah buffer deadline?"
          message="Berlaku untuk jadwal baru. Jadwal yang sudah ada tidak berubah."
          warning="Dipakai oleh Tambah Creator, Tambah Konten, edit deadline, Perpanjang Kontrak dan Ajukan Konten."
          details={bufferChangeDetails(current, Number(typed))}
          confirmLabel="Ya, Ubah"
          cancelLabel="Kembali"
          confirmVariant="accent"
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}
