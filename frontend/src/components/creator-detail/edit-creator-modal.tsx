"use client";

import { useId, useState, type ReactNode } from "react";
import { ALERT, FIELD, Field } from "@/components/creators/contract-terms-fields";
import { useFieldErrors } from "@/components/creators/use-field-errors";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { digitsOnly, NUMERIC_INPUT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import type { CreatorPeriod, CreatorProfile } from "@/lib/creator-detail";
import {
  dayBefore,
  editChanges,
  editLocks,
  editRequest,
  initialEdit,
  nextPeriod,
  validateCreatorEdit,
  type CreatorEditInput,
  type CreatorEditRequest,
  type EditField,
  type UsernameLocks,
} from "@/lib/creator-edit";
import {
  CONTRACT_TYPE_LABELS,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  type ContractType,
  type CreatorFormErrors,
} from "@/lib/creator-form";
import { formatDate, formatRupiah } from "@/lib/format";

/** A field that only shows its value: set back from the ones that take one. */
const READ_ONLY =
  "rounded-(--radius-control) border border-rule bg-surface-2 px-3 py-1.5 text-[13px] text-ink-2";

/** A read-only field and why it is one. Focusable, unlike a disabled one, so a keyboard reaches both. */
function LockedField({ label, value, reason }: Readonly<{ label: string; value: string; reason: string }>) {
  return (
    <Field label={label} optional hint={{ label: `Kenapa ${label} tidak bisa diubah`, text: reason }}>
      <input type="text" className={READ_ONLY} readOnly value={value} />
    </Field>
  );
}

const USERNAMES = [
  { field: "instagramUsername", label: "Username Instagram" },
  { field: "tiktokUsername", label: "Username TikTok" },
] as const;

/**
 * "Ubah Data" (PBI-16, 16.2): Tambah Creator's fields, in its order and words, opened on the
 * creator and the period on show. What may not change today is read-only with its reason beside
 * the label; Simpan opens a confirmation that lists every change (AC 4).
 */
export function EditCreatorModal({
  creator,
  period,
  periods,
  usernameLocks,
  onClose,
  onSubmit,
  loading,
  serverErrors,
  formError,
}: Readonly<{
  creator: CreatorProfile;
  /** The period whose terms are edited; null for a creator without a contract. */
  period: CreatorPeriod | null;
  periods: readonly CreatorPeriod[];
  usernameLocks: UsernameLocks;
  onClose: () => void;
  onSubmit: (request: CreatorEditRequest) => void;
  loading: boolean;
  /** The server's message per field from the last rejected save. */
  serverErrors: CreatorFormErrors;
  /** A save failure that belongs to no single field. */
  formError?: string;
}>) {
  const [initial] = useState(() => initialEdit(creator, period));
  const [form, setForm] = useState<CreatorEditInput>(initial);
  const [confirming, setConfirming] = useState(false);
  const countId = useId();

  const locks = editLocks(usernameLocks, period);
  const next = nextPeriod(period, periods);
  const liveErrors = validateCreatorEdit(form, initial, period, next);
  const isValid = Object.keys(liveErrors).length === 0;
  // A half-filled form has nothing to list: a cleared date or type has no wording.
  const changes = isValid ? editChanges(form, initial) : [];
  const isDirty = (Object.keys(initial) as EditField[]).some((field) => form[field] !== initial[field]);
  const { markTouched, markEdited, fieldError } = useFieldErrors<keyof CreatorFormErrors>(
    liveErrors,
    serverErrors,
  );
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty,
    onDiscard: onClose,
    title: "Buang perubahan?",
  });

  function change<F extends EditField>(field: F, value: CreatorEditInput[F]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    markEdited([field]);
  }

  function terms(current: CreatorPeriod): ReactNode {
    return (
      <fieldset className="mb-4 border-t border-rule pt-3">
        <legend className="pr-2 text-[13px] font-bold text-ink">
          {`Kontrak & Jadwal · Periode ${current.periodNumber}`}
        </legend>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Jenis Kontrak" error={fieldError("contractType")}>
            <select
              className={FIELD}
              required
              value={form.contractType}
              onChange={(event) => change("contractType", event.target.value as ContractType | "")}
              onBlur={() => markTouched("contractType")}
            >
              <option value="">Pilih jenis kontrak</option>
              {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((type) => (
                <option key={type} value={type}>
                  {CONTRACT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          {locks.fixedRate ? (
            <LockedField
              label="Fixed Rate Kontrak (Rp)"
              value={formatRupiah(current.fixedRate)}
              reason={locks.fixedRate}
            />
          ) : (
            <Field
              label="Fixed Rate Kontrak (Rp)"
              error={fieldError("fixedRate")}
              hint={{
                label: "Info Fixed Rate Kontrak",
                text: "Rate tetap untuk periode ini. Invoice yang berjalan langsung dihitung ulang.",
              }}
            >
              <AmountInput
                className={FIELD}
                required
                value={form.fixedRate}
                onChange={(value) => change("fixedRate", value)}
                onBlur={() => markTouched("fixedRate")}
              />
            </Field>
          )}

          <LockedField
            label="Mulai Kontrak"
            value={formatDate(current.startDate)}
            reason={locks.contractStart as string}
          />

          {locks.contractEnd ? (
            <LockedField
              label="Akhir Kontrak"
              value={formatDate(current.endDate)}
              reason={locks.contractEnd}
            />
          ) : (
            <Field label="Akhir Kontrak" error={fieldError("contractEnd")}>
              <input
                type="date"
                className={FIELD}
                required
                min={current.endDate}
                max={next ? dayBefore(next.startDate) : undefined}
                value={form.contractEnd}
                // A date is picked, not typed: its verdict is due as soon as it changes.
                onChange={(event) => {
                  change("contractEnd", event.target.value);
                  markTouched("contractEnd");
                }}
                onBlur={() => markTouched("contractEnd")}
              />
            </Field>
          )}

          {locks.quota ? (
            <LockedField
              label="Jumlah konten yang disepakati"
              value={String(current.contentQuota)}
              reason={locks.quota}
            />
          ) : (
            <Field label="Jumlah konten yang disepakati" error={fieldError("quota")}>
              <input
                {...NUMERIC_INPUT}
                className={FIELD}
                required
                value={form.quota === 0 ? "" : form.quota}
                onChange={(event) => change("quota", Number(digitsOnly(event.target.value)))}
                onBlur={() => markTouched("quota")}
              />
            </Field>
          )}

          <LockedField
            label="Jarak antar-deadline (hari)"
            value={String(current.daysBetween)}
            reason={locks.interval as string}
          />
        </div>
      </fieldset>
    );
  }

  return (
    <>
      <Modal
        title={`Ubah Data Creator — ${creator.name}`}
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Batal
            </Button>
            <Button
              variant="accent"
              onClick={() => setConfirming(true)}
              disabled={loading || changes.length === 0}
            >
              {loading ? "Menyimpan…" : "Simpan"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-muted">Kolom bertanda * wajib diisi.</p>

        <fieldset className="mb-4 border-t border-rule pt-3">
          <legend className="pr-2 text-[13px] font-bold text-ink">Data Creator</legend>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Nama Creator"
              error={fieldError("name")}
              note={<CharLimit id={`${countId}-name`} length={form.name.length} max={MAX_NAME_LENGTH} />}
            >
              <input
                type="text"
                className={FIELD}
                required
                maxLength={MAX_NAME_LENGTH}
                aria-describedby={`${countId}-name`}
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
                  <CharLimit id={`${countId}-email`} length={form.email.length} max={MAX_EMAIL_LENGTH} />
                ) : null
              }
            >
              <input
                type="email"
                className={FIELD}
                required
                maxLength={MAX_EMAIL_LENGTH}
                aria-describedby={form.email.length >= MAX_EMAIL_LENGTH ? `${countId}-email` : undefined}
                value={form.email}
                onChange={(event) => change("email", event.target.value)}
                onBlur={() => markTouched("email")}
              />
            </Field>

            {USERNAMES.map(({ field, label }) => {
              const reason = locks[field];
              return reason ? (
                <LockedField key={field} label={label} value={form[field]} reason={reason} />
              ) : (
                <Field
                  key={field}
                  label={label}
                  optional
                  error={fieldError(field)}
                  note={
                    <CharLimit id={`${countId}-${field}`} length={form[field].length} max={MAX_USERNAME_LENGTH} />
                  }
                >
                  <input
                    type="text"
                    className={FIELD}
                    maxLength={MAX_USERNAME_LENGTH}
                    aria-describedby={`${countId}-${field}`}
                    placeholder="mis. salsa.amelia"
                    value={form[field]}
                    onChange={(event) => change(field, event.target.value)}
                    onBlur={() => markTouched(field)}
                  />
                </Field>
              );
            })}
          </div>
        </fieldset>

        {period ? terms(period) : null}

        {formError ? (
          <p role="alert" className={`mt-3 ${ALERT}`}>
            {formError}
          </p>
        ) : null}
      </Modal>

      {confirming ? (
        <ConfirmDialog
          title="Simpan perubahan data?"
          message="Periksa perubahan berikut sebelum disimpan."
          warning={
            changes.some(({ field }) => field === "email")
              ? "Creator harus masuk dengan email baru. Sesi yang sedang aktif akan diakhiri."
              : undefined
          }
          details={changes.map(({ label, from, to }) => [label, `${from} → ${to}`] as const)}
          confirmLabel="Simpan Perubahan"
          cancelLabel="Kembali"
          confirmVariant="accent"
          onConfirm={() => {
            setConfirming(false);
            onSubmit(editRequest(form, initial, period));
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {confirmDialog}
    </>
  );
}
