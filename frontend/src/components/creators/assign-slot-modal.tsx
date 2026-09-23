"use client";

import { useState, type FormEvent } from "react";
import { assignManualSlot } from "@/lib/contents";

const FIELD =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink";

const FORM_ID = "assign-slot-form";

export function AssignSlotModal({
  deadline,
  onClose,
  onAssigned,
}: {
  deadline: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await assignManualSlot({
        contentId: crypto.randomUUID(),
        deadline,
      });
      onAssigned();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah Konten"
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-panel)] bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg">Tambah Konten</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-base leading-none text-muted hover:bg-surface-low hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4 px-6 py-5">
          <div>
            <p className="text-[13px] text-muted">Deadline</p>
            <p className="text-[13px] font-semibold text-ink">{deadline}</p>
          </div>

          <div>
            <label htmlFor="content-name" className="mb-1 block text-[13px] font-semibold">
              Nama Konten <span className="text-red">*</span>
            </label>
            <input
              id="content-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
            />
          </div>

          {error ? (
            <p role="alert" className="text-[13px] text-red">
              {error}
            </p>
          ) : null}
        </form>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-control)] border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-low hover:text-ink"
          >
            Batal
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={!canSubmit}
            className="cursor-pointer rounded-[var(--radius-control)] border border-blue bg-blue px-3 py-1.5 text-xs font-semibold text-white hover:border-blue-deep hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
