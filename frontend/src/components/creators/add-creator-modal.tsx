"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import DeadlinePreview from "./deadline-preview";
import {
  BUFFER_DAYS,
  contractDateLimits,
  localCalendarDay,
  scheduleDeadlines,
  validateCreatorForm,
  type CreatorFormErrors,
  type CreatorFormInput,
  type SocialPlatform,
} from "@/lib/creator-form";
import type { NewCreatorRequest } from "@/lib/creators";

const ALERT = "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";

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
    // The message sits outside the label so it never becomes part of the input's name.
    <div className="flex flex-col gap-1 text-[13px]">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {children}
      </label>
      {error ? <span className="text-xs text-red-ink">{error}</span> : null}
    </div>
  );
}

// A required numeric field displays empty rather than "0" — 0 is never a valid value for
// either field that uses this, and showing it as a literal digit meant typing "1" into the
// field produced "01" (manual UI review finding).
function emptyIfZero(value: number): number | "" {
  return value === 0 ? "" : value;
}

const NO_ERRORS: CreatorFormErrors = {};

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
  serverErrors = NO_ERRORS,
  formError,
}: {
  onClose: () => void;
  onSubmit: (input: NewCreatorRequest) => void;
  loading?: boolean;
  /** The server's message per field from the last rejected save. */
  serverErrors?: CreatorFormErrors;
  /** A save failure that belongs to no single field. */
  formError?: string;
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
  // Fields edited since the server last answered: their server message no longer describes
  // what is in the input. Reset whenever a new set of server messages arrives.
  const [answered, setAnswered] = useState(serverErrors);
  const [edited, setEdited] = useState<Partial<Record<keyof CreatorFormInput, boolean>>>({});
  if (answered !== serverErrors) {
    setAnswered(serverErrors);
    setEdited({});
  }

  const today = localCalendarDay(new Date());
  const limits = contractDateLimits(form, today);
  const schedule = scheduleDeadlines(form, today);

  // Recomputed on every render — the single source of truth for both Simpan's disabled state
  // and the per-field error messages below, so there is only one place validation ever runs.
  const liveErrors = validateCreatorForm(form, undefined, existingEmails);
  const isFormValid = Object.keys(liveErrors).length === 0;

  function markTouched(field: keyof CreatorFormInput) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function change<K extends keyof CreatorFormInput>(field: K, value: CreatorFormInput[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setEdited((prev) => ({ ...prev, [field]: true }));
  }

  function fieldError(field: keyof CreatorFormInput): string | undefined {
    const live = touched[field] ? liveErrors[field] : undefined;
    return live ?? (edited[field] ? undefined : serverErrors[field]);
  }

  const scheduleError = liveErrors.deadlines ?? serverErrors.deadlines;

  function handleSubmit() {
    if (isFormValid && schedule !== null) {
      onSubmit({ ...form, deadlines: schedule.autoDeadlines });
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
            onChange={(event) => change("name", event.target.value)}
            onBlur={() => markTouched("name")}
          />
        </Field>

        <Field label="Email" error={fieldError("email")}>
          <input
            type="email"
            className={FIELD}
            value={form.email}
            onChange={(event) => change("email", event.target.value)}
            onBlur={() => markTouched("email")}
          />
        </Field>

        <Field label="Platform" error={fieldError("socialPlatform")}>
          <select
            className={FIELD}
            value={form.socialPlatform}
            onChange={(event) =>
              change("socialPlatform", event.target.value as SocialPlatform | "")
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
            onChange={(event) => change("socialUsername", event.target.value)}
            onBlur={() => markTouched("socialUsername")}
          />
        </Field>

        <Field label="Mulai Kontrak" error={fieldError("contractStart")}>
          <input
            type="date"
            className={FIELD}
            min={limits.startMin}
            max={limits.startMax}
            value={form.contractStart}
            onChange={(event) => change("contractStart", event.target.value)}
            onBlur={() => markTouched("contractStart")}
          />
        </Field>

        <Field label="Akhir Kontrak" error={fieldError("contractEnd")}>
          <input
            type="date"
            className={FIELD}
            min={limits.endMin}
            value={form.contractEnd}
            onChange={(event) => change("contractEnd", event.target.value)}
          />
        </Field>

        <Field label="Jarak antar-deadline (hari)" error={fieldError("interval")}>
          <input
            type="number"
            className={FIELD}
            value={form.interval}
            onChange={(event) => change("interval", Number(event.target.value))}
            onBlur={() => markTouched("interval")}
          />
        </Field>

        <Field label="Fixed rate per konten (Rp)" error={fieldError("fixedRate")}>
          <input
            type="number"
            className={FIELD}
            placeholder="mis. 500000"
            value={emptyIfZero(form.fixedRate)}
            onChange={(event) => change("fixedRate", Number(event.target.value))}
            onBlur={() => markTouched("fixedRate")}
          />
        </Field>

        <Field label="Jumlah konten yang disepakati" error={fieldError("quota")}>
          <input
            type="number"
            className={FIELD}
            placeholder="mis. 6"
            value={emptyIfZero(form.quota)}
            onChange={(event) => change("quota", Number(event.target.value))}
            onBlur={() => markTouched("quota")}
          />
        </Field>
      </div>

      {schedule !== null ? (
        <div className="mt-4">
          <DeadlinePreview
            contractStart={form.contractStart}
            today={today}
            bufferDays={BUFFER_DAYS}
            {...schedule}
          />
        </div>
      ) : null}

      {scheduleError ? (
        <p role="alert" className={`mt-3 ${ALERT}`}>
          {scheduleError}
        </p>
      ) : null}

      {formError ? (
        <p role="alert" className={`mt-3 ${ALERT}`}>
          {formError}
        </p>
      ) : null}
    </Modal>
  );
}
