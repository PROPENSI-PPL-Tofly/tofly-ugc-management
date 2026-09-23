"use client";

import { Modal } from "@/components/ui/modal";

// Same field styling as the filter bar's inputs, for a consistent form control vocabulary.
const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function AddCreatorModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Tambah Creator" onClose={onClose}>
      <Field label="Nama Creator">
        <input type="text" className={FIELD} />
      </Field>

      <Field label="Email">
        <input type="email" className={FIELD} />
      </Field>

      <Field label="Mulai Kontrak">
        <input type="date" className={FIELD} />
      </Field>

      <Field label="Akhir Kontrak">
        <input type="date" className={FIELD} />
      </Field>

      <Field label="Jarak antar-deadline (hari)">
        <input type="number" className={FIELD} />
      </Field>

      <Field label="Fixed rate per konten (Rp)">
        <input type="number" className={FIELD} />
      </Field>

      <Field label="Jumlah konten yang disepakati">
        <input type="number" className={FIELD} />
      </Field>
    </Modal>
  );
}
