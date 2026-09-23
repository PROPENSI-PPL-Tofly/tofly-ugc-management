"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  validateCreatorForm,
  type CreatorFormErrors,
  type CreatorFormInput,
} from "@/lib/creator-form";

// Same field styling as the filter bar's inputs, for a consistent form control vocabulary.
const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-semibold">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-ink">{error}</span> : null}
    </label>
  );
}

const INITIAL_FORM: CreatorFormInput = {
  name: "",
  email: "",
  contractStart: "",
  contractEnd: "",
  interval: 14,
  quota: 0,
  fixedRate: 0,
};

export function AddCreatorModal({
  onClose,
  onSubmit,
  loading = false,
}: {
  onClose: () => void;
  onSubmit: (input: CreatorFormInput) => void;
  loading?: boolean;
}) {
  const [form, setForm] = useState<CreatorFormInput>(INITIAL_FORM);
  const [errors, setErrors] = useState<CreatorFormErrors>({});

  // Recomputed on every render, separate from the `errors` state above: `errors` only
  // updates on a submit attempt (so the form stays quiet while the admin is still typing),
  // but Simpan's disabled state has to track validity live, field by field.
  const isFormValid = Object.keys(validateCreatorForm(form)).length === 0;

  function handleSubmit() {
    const nextErrors = validateCreatorForm(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length === 0) {
      onSubmit(form);
    }
  }

  return (
    <Modal
      title="Tambah Creator"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>

          <Button variant="accent" onClick={handleSubmit} disabled={loading || !isFormValid}>
            Simpan
          </Button>
        </>
      }
    >
      <Field label="Nama Creator" error={errors.name}>
        <input
          type="text"
          className={FIELD}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Field>

      <Field label="Email" error={errors.email}>
        <input
          type="email"
          className={FIELD}
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
      </Field>

      <Field label="Mulai Kontrak" error={errors.contractStart}>
        <input
          type="date"
          className={FIELD}
          value={form.contractStart}
          onChange={(event) => setForm({ ...form, contractStart: event.target.value })}
        />
      </Field>

      <Field label="Akhir Kontrak">
        <input
          type="date"
          className={FIELD}
          value={form.contractEnd}
          onChange={(event) => setForm({ ...form, contractEnd: event.target.value })}
        />
      </Field>

      <Field label="Jarak antar-deadline (hari)" error={errors.interval}>
        <input
          type="number"
          className={FIELD}
          value={form.interval}
          onChange={(event) => setForm({ ...form, interval: Number(event.target.value) })}
        />
      </Field>

      <Field label="Fixed rate per konten (Rp)" error={errors.fixedRate}>
        <input
          type="number"
          className={FIELD}
          value={form.fixedRate}
          onChange={(event) => setForm({ ...form, fixedRate: Number(event.target.value) })}
        />
      </Field>

      <Field label="Jumlah konten yang disepakati" error={errors.quota}>
        <input
          type="number"
          className={FIELD}
          value={form.quota}
          onChange={(event) => setForm({ ...form, quota: Number(event.target.value) })}
        />
      </Field>
    </Modal>
  );
}
