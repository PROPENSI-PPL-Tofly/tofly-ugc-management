"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  validateCreatorForm,
  type CreatorFormErrors,
  type CreatorFormInput,
  type SocialPlatform,
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

// A required numeric field displays empty rather than "0" — 0 is never a valid value for
// either field that uses this, and showing it as a literal digit meant typing "1" into the
// field produced "01" (manual UI review finding).
function emptyIfZero(value: number): number | "" {
  return value === 0 ? "" : value;
}

const INITIAL_FORM: CreatorFormInput = {
  name: "",
  email: "",
  contractStart: "",
  contractEnd: "",
  interval: 14,
  quota: 0,
  fixedRate: 0,
  socialPlatform: "",
  socialUsername: "",
};

export function AddCreatorModal({
  onClose,
  onSubmit,
  loading = false,
  existingEmails = [],
}: {
  onClose: () => void;
  onSubmit: (input: CreatorFormInput) => void;
  loading?: boolean;
  /** Emails already on this page's creator list — the frontend-only half of duplicate
   *  detection; the database's unique constraint remains the authoritative check once the
   *  create endpoint ships. */
  existingEmails?: string[];
}) {
  const [form, setForm] = useState<CreatorFormInput>(INITIAL_FORM);
  // Which fields the admin has already blurred at least once. Simpan's disabled state tracks
  // liveErrors directly regardless of this, but a field only *shows* its error once touched —
  // otherwise every field would flash red the instant the modal opens.
  const [touched, setTouched] = useState<Partial<Record<keyof CreatorFormInput, boolean>>>({});

  // Recomputed on every render — the single source of truth for both Simpan's disabled state
  // and the per-field error messages below, so there is only one place validation ever runs.
  const liveErrors = validateCreatorForm(form, undefined, existingEmails);
  const isFormValid = Object.keys(liveErrors).length === 0;

  function markTouched(field: keyof CreatorFormInput) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function fieldError(field: keyof CreatorFormErrors): string | undefined {
    return touched[field] ? liveErrors[field] : undefined;
  }

  function handleSubmit() {
    if (isFormValid) {
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
      {/* Two columns on desktop, one on mobile — same responsive grid pattern already used
          for CreatorDetailModal's info grid, so both modals share one layout vocabulary. */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nama Creator" error={fieldError("name")}>
          <input
            type="text"
            className={FIELD}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            onBlur={() => markTouched("name")}
          />
        </Field>

        <Field label="Email" error={fieldError("email")}>
          <input
            type="email"
            className={FIELD}
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            onBlur={() => markTouched("email")}
          />
        </Field>

        <Field label="Platform" error={fieldError("socialPlatform")}>
          <select
            className={FIELD}
            value={form.socialPlatform}
            onChange={(event) =>
              setForm({ ...form, socialPlatform: event.target.value as SocialPlatform | "" })
            }
            onBlur={() => markTouched("socialPlatform")}
          >
            <option value="">Pilih platform</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </Field>

        <Field label="Username Social Media" error={fieldError("socialUsername")}>
          <input
            type="text"
            className={FIELD}
            placeholder="mis. salsa.amelia"
            value={form.socialUsername}
            onChange={(event) => setForm({ ...form, socialUsername: event.target.value })}
            onBlur={() => markTouched("socialUsername")}
          />
        </Field>

        <Field label="Mulai Kontrak" error={fieldError("contractStart")}>
          <input
            type="date"
            className={FIELD}
            value={form.contractStart}
            onChange={(event) => setForm({ ...form, contractStart: event.target.value })}
            onBlur={() => markTouched("contractStart")}
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

        <Field label="Jarak antar-deadline (hari)" error={fieldError("interval")}>
          <input
            type="number"
            className={FIELD}
            value={form.interval}
            onChange={(event) => setForm({ ...form, interval: Number(event.target.value) })}
            onBlur={() => markTouched("interval")}
          />
        </Field>

        <Field label="Fixed rate per konten (Rp)" error={fieldError("fixedRate")}>
          <input
            type="number"
            className={FIELD}
            placeholder="mis. 500000"
            value={emptyIfZero(form.fixedRate)}
            onChange={(event) => setForm({ ...form, fixedRate: Number(event.target.value) })}
            onBlur={() => markTouched("fixedRate")}
          />
        </Field>

        <Field label="Jumlah konten yang disepakati" error={fieldError("quota")}>
          <input
            type="number"
            className={FIELD}
            placeholder="mis. 6"
            value={emptyIfZero(form.quota)}
            onChange={(event) => setForm({ ...form, quota: Number(event.target.value) })}
            onBlur={() => markTouched("quota")}
          />
        </Field>
      </div>
    </Modal>
  );
}
