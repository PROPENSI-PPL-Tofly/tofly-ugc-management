"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  ALERT,
  ContractTermsFields,
  DeadlineSchedule,
  FIELD,
  Field,
  useDeadlineAllocation,
} from "./contract-terms-fields";
import { useFieldErrors } from "./use-field-errors";
import {
  localCalendarDay,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  scheduleReady,
  validateCreatorForm,
  type CreatorFormErrors,
  type CreatorFormInput,
} from "@/lib/creator-form";
import { NO_PICKS } from "@/lib/deadline-allocation";
import type { NewCreatorRequest } from "@/lib/creators";

/** One optional username per platform, Instagram first as the API saves them. */
const USERNAME_FIELDS = [
  { field: "instagramUsername", label: "Username Instagram", placeholder: "mis. salsa.amelia" },
  { field: "tiktokUsername", label: "Username TikTok", placeholder: "mis. salsa.amelia" },
] as const;

const NO_ERRORS: CreatorFormErrors = {};

const INITIAL_FORM: CreatorFormInput = {
  name: "",
  email: "",
  contractStart: "",
  contractEnd: "",
  interval: 14,
  quota: 0,
  fixedRate: null,
  instagramUsername: "",
  tiktokUsername: "",
  contractType: "",
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
  const nameCountId = useId();
  const emailCountId = useId();
  const instagramCountId = useId();
  const tiktokCountId = useId();
  const today = localCalendarDay(new Date());
  // What the admin changed on the calendar; re-applied to whatever the contract now allows.
  const { allocation, picks, setPicks } = useDeadlineAllocation(form, today);
  const remaining = allocation?.remaining ?? 0;

  // Recomputed on every render — the single source of truth for both Simpan's disabled state
  // and the per-field error messages below, so there is only one place validation ever runs.
  const liveErrors = validateCreatorForm(form, undefined, existingEmails);
  const isFormValid = Object.keys(liveErrors).length === 0;
  // Simpan's disabled state reads liveErrors directly; a field only *shows* its message once
  // touched, or the server's until it is edited (see useFieldErrors).
  const { markTouched, markEdited, fieldError } = useFieldErrors<keyof CreatorFormErrors>(
    liveErrors,
    serverErrors,
  );
  // The calendar only once the dates it draws are ones that could be saved.
  const showSchedule = allocation !== null && scheduleReady(liveErrors);

  // Every way out (Batal, ✕, Escape, a press outside) asks first once anything was typed.
  const isDirty =
    picks !== NO_PICKS ||
    (Object.keys(INITIAL_FORM) as (keyof CreatorFormInput)[]).some(
      (field) => form[field] !== INITIAL_FORM[field],
    );
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty,
    onDiscard: onClose,
    title: "Batalkan penambahan creator?",
  });

  function change<K extends keyof CreatorFormInput>(field: K, value: CreatorFormInput[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    markEdited([field]);
  }

  // The contract's terms come back as a patch from ContractTermsFields, one field at a time.
  function patch(changes: Partial<CreatorFormInput>) {
    for (const field of Object.keys(changes) as (keyof CreatorFormInput)[]) {
      change(field, changes[field] as CreatorFormInput[typeof field]);
    }
  }

  // A date is picked, not typed: its verdict is due as soon as it changes, not on blur.
  function changeDate(field: "contractStart" | "contractEnd", value: string) {
    change(field, value);
    markTouched(field);
  }

  const scheduleError = serverErrors.deadlines;

  // Simpan is disabled until the form is valid and every content has a day, so there is
  // always an allocation by the time it can be clicked.
  const deadlines = allocation?.deadlines ?? [];

  function handleSubmit() {
    // Simpan stays disabled until the form validates, so the fixed rate is filled in by now.
    onSubmit({ ...form, fixedRate: form.fixedRate ?? 0, deadlines });
  }

  return (
    <>
    <Modal
      title="Tambah Creator"
      onClose={requestClose}
      footer={
        <>
          <Button variant="ghost" onClick={requestClose}>
            Batal
          </Button>

          <Button
            variant="accent"
            onClick={handleSubmit}
            disabled={loading || !isFormValid || remaining > 0}
          >
            Simpan
          </Button>
        </>
      }
    >
      {/* Who the creator is, then what the contract and schedule are. Two columns on desktop,
          one on mobile — the same grid CreatorDetailModal's info grid uses. */}
      <p className="mb-3 text-xs text-muted">Kolom bertanda * wajib diisi.</p>

      <fieldset className="mb-4 border-t border-rule pt-3">
        <legend className="pr-2 text-[13px] font-bold text-ink">Data Creator</legend>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            label="Nama Creator"
            error={fieldError("name")}
            note={<CharLimit id={nameCountId} length={form.name.length} max={MAX_NAME_LENGTH} />}
          >
            <input
              type="text"
              className={FIELD}
              required
              maxLength={MAX_NAME_LENGTH}
              aria-describedby={nameCountId}
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              onBlur={() => markTouched("name")}
            />
          </Field>

          <Field
            label="Email"
            error={fieldError("email")}
            note={
              form.email.length >= MAX_EMAIL_LENGTH ? (
                <CharLimit id={emailCountId} length={form.email.length} max={MAX_EMAIL_LENGTH} />
              ) : null
            }
          >
            <input
              type="email"
              className={FIELD}
              required
              maxLength={MAX_EMAIL_LENGTH}
              aria-describedby={form.email.length >= MAX_EMAIL_LENGTH ? emailCountId : undefined}
              value={form.email}
              onChange={(event) => change("email", event.target.value)}
              onBlur={() => markTouched("email")}
            />
          </Field>

          {USERNAME_FIELDS.map(({ field, label, placeholder }) => {
            const countId = field === "instagramUsername" ? instagramCountId : tiktokCountId;
            return (
              <Field
                key={field}
                label={label}
                optional
                error={fieldError(field)}
                note={<CharLimit id={countId} length={form[field].length} max={MAX_USERNAME_LENGTH} />}
              >
                <input
                  type="text"
                  className={FIELD}
                  maxLength={MAX_USERNAME_LENGTH}
                  aria-describedby={countId}
                  placeholder={placeholder}
                  value={form[field]}
                  onChange={(event) => change(field, event.target.value)}
                  onBlur={() => markTouched(field)}
                />
              </Field>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mb-4 border-t border-rule pt-3">
        <legend className="pr-2 text-[13px] font-bold text-ink">Kontrak &amp; Jadwal</legend>
        <ContractTermsFields
          terms={form}
          today={today}
          fieldError={fieldError}
          onChange={patch}
          onDateChange={changeDate}
          onBlur={markTouched}
          fixedRateHint="Rate tetap untuk periode kontrak pertama creator ini. Tidak ada biaya default untuk tiap konten."
        />
      </fieldset>

      <DeadlineSchedule
        terms={form}
        today={today}
        allocation={allocation}
        show={showSchedule}
        setPicks={setPicks}
        error={scheduleError}
      />

      {formError ? (
        <p role="alert" className={`mt-3 ${ALERT}`}>
          {formError}
        </p>
      ) : null}
    </Modal>
    {confirmDialog}
    </>
  );
}
