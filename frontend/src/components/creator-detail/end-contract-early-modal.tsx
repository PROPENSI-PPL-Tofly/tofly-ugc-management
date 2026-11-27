"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { ALERT } from "@/components/ui/form-classes";
import { InfoTip } from "@/components/ui/info-tip";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import { FIELD, Field } from "@/components/creators/contract-terms-fields";
import { EARLY_END_REASON_LABELS } from "@/lib/contract-extension";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { EarlyEndReason } from "@/lib/creators";
import {
  ACCESS_LABELS,
  EMPTY_EARLY_END_FORM,
  NOTE_MAX,
  earlyEndRequest,
  isEarlyEndDirty,
  lastDayWindow,
  reasonWarning,
  validateEarlyEnd,
  type EarlyEndErrors,
  type EarlyEndForm,
  type InvoiceChoice,
  type UpcomingChoice,
} from "@/lib/early-end";
import { endContractEarly, previewEarlyEnd, type EarlyEndPlan, type PlannedPeriod } from "@/lib/early-end-api";
import { formatContractWindow, formatDate, jakartaDay } from "@/lib/format";

type ErrorField = keyof EarlyEndErrors;

const INVOICE_CHOICES: readonly { value: InvoiceChoice; label: string; hint: string }[] = [
  { value: "pay", label: "Bayar Sesuai Kontrak", hint: "Finalize dan bayar seperti biasa" },
  { value: "cancel", label: "Batalkan Invoice", hint: "Tidak dibayar, berlaku mulai hari ini" },
];

const UPCOMING_CHOICES: readonly { value: UpcomingChoice; label: string; hint: string }[] = [
  { value: "keep", label: "Pertahankan", hint: "Periode dan jadwalnya tetap, creator tetap punya akses" },
  { value: "delete", label: "Hapus", hint: "Jadwal, konten dan invoice kosongnya ikut terhapus" },
];

/** Two or more options as cards, one chosen at most; none is chosen until the admin picks. */
function ChoiceGroup<V extends string>({
  legend,
  name,
  options,
  value,
  error,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly { value: V; label: string; hint: string }[];
  value: V | "";
  error?: string;
  onChange: (value: V) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 text-[13px]">
      <legend className="mb-1.5 font-semibold">
        {legend}
        <span aria-hidden="true" className="ml-0.5 text-red-ink">
          *
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-2 rounded-(--radius-control) border border-rule bg-surface px-3 py-2 has-checked:border-brand has-checked:bg-brand-wash"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-semibold">{option.label}</span>
              <span className="text-xs text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {error ? <span className="text-xs text-red-ink">{error}</span> : null}
    </fieldset>
  );
}

/** One line of the confirmation: what changes, and why behind an ⓘ when it needs saying. */
function Consequence({ label, value, tip, detail }: { label: string; value: string; tip?: string; detail?: string }) {
  return (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-semibold text-ink">
        <span className="inline-flex items-center gap-1">
          {value}
          {tip ? <InfoTip label={`Info ${label}`} text={tip} align="end" /> : null}
        </span>
        {detail ? <span className="block text-xs font-normal text-muted">{detail}</span> : null}
      </dd>
    </div>
  );
}

function periodRows(periods: readonly PlannedPeriod[], kept: boolean): ReactNode[] {
  return periods.map((period) => (
    <Consequence
      key={period.contractId}
      label={`Periode ${period.periodNumber}`}
      value={`${kept ? "Dipertahankan" : "Dihapus"} (${formatContractWindow(period.startDate, period.endDate)})`}
      tip={
        kept
          ? "Belum dimulai. Periode dan jadwalnya tetap, creator tetap punya akses."
          : "Belum dimulai. Jadwal, konten dan invoice kosongnya ikut terhapus."
      }
    />
  ));
}

/** The one confirmation (AC 4): every consequence, from the API's own plan. */
function Consequences({ plan, form }: { plan: EarlyEndPlan; form: EarlyEndForm }) {
  const last = formatDate(plan.lastDay);
  const warning = plan.reasonMismatch ? reasonWarning(form) : null;

  return (
    <div className="flex flex-col gap-3">
      {warning ? (
        <p className="rounded-(--radius-control) border border-amber-wash bg-amber-wash px-3 py-2 text-[13px] font-semibold text-amber-ink">
          {warning}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-(--radius-control) bg-surface-2 px-3 py-2.5 text-[13px]">
        <Consequence label="Kontrak" value={`Berakhir ${last} (semula ${formatDate(plan.originalEndDate)})`} />
        <Consequence
          label="Konten"
          value={plan.closing.length > 0 ? `${plan.closing.length} konten setelah ${last} ditutup` : "Tidak ada konten yang ditutup"}
          detail={plan.closing.map((content) => content.name).join(", ") || undefined}
        />
        {plan.unfinished.length > 0 ? (
          <Consequence
            label="Belum Selesai"
            value={`${plan.unfinished.length} konten sampai ${last}`}
            tip="Tidak dibayar kalau link tidak dikirim sampai hari terakhir. Penalti Evergreen tetap berlaku."
          />
        ) : null}
        {plan.invoice === "cancel" ? (
          <Consequence label="Invoice" value="Dibatalkan, tidak dibayar" />
        ) : (
          <Consequence
            label="Invoice"
            value={`Bisa difinalisasi mulai ${formatDate(plan.finalizableFrom)}`}
            detail="Fixed rate tetap penuh. Potong lewat penyesuaian sebelum finalize."
          />
        )}
        <Consequence label="Akses Creator" value={ACCESS_LABELS[plan.access]} />
        {periodRows(plan.deletedPeriods, false)}
        {periodRows(plan.keptPeriods, true)}
      </dl>
      <p className="text-xs font-semibold text-red-ink">Tidak bisa dibatalkan setelah dikonfirmasi.</p>
    </div>
  );
}

/**
 * "Akhiri Kontrak Lebih Awal" (PBI-37, 37.2): the form, then one confirmation of what the API plans
 * to do, then the end. The form follows the prototype; the keep-or-delete choice for periods that
 * have not started follows AC 3. Field messages use the API's words, so the browser's check and
 * the server's never disagree; a refusal from the server comes back under its field.
 */
export function EndContractEarlyModal({
  creatorId,
  creatorName,
  period,
  upcoming,
  onClose,
  onEnded,
}: {
  creatorId: string;
  creatorName: string;
  /** The running period being ended. */
  period: CreatorPeriod;
  /** The periods that have not started, oldest first. */
  upcoming: readonly CreatorPeriod[];
  onClose: () => void;
  /** The end was saved, with the plan the API carried out. */
  onEnded: (plan: EarlyEndPlan) => void;
}) {
  // Jakarta's day, as the API counts it, not the browser's: an admin abroad sees the same range.
  const today = jakartaDay();
  const noteCountId = useId();
  const [form, setForm] = useState<EarlyEndForm>(EMPTY_EARLY_END_FORM);
  const [touched, setTouched] = useState<ReadonlySet<ErrorField>>(new Set());
  const [serverErrors, setServerErrors] = useState<EarlyEndErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [plan, setPlan] = useState<EarlyEndPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = validateEarlyEnd(form, period, today, upcoming.length);
  const dayWindow = lastDayWindow(period, today);
  const request = earlyEndRequest(form, today, upcoming.length);
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: isEarlyEndDirty(form),
    onDiscard: onClose,
    title: "Batalkan pengakhiran kontrak?",
  });

  function touch(field: ErrorField) {
    setTouched((prev) => new Set(prev).add(field));
  }

  /** A change to the form; the field it touches shows its own message from now on. */
  function patch(changes: Partial<EarlyEndForm>, field: ErrorField) {
    setForm((prev) => ({ ...prev, ...changes }));
    touch(field);
    setServerErrors((prev) => {
      const rest = { ...prev };
      delete rest[field];
      return rest;
    });
  }

  const fieldError = (field: ErrorField) => serverErrors[field] ?? (touched.has(field) ? errors[field] : undefined);

  async function preview() {
    setBusy(true);
    setFormError(null);
    const result = await previewEarlyEnd(creatorId, period.contractId, request);
    setBusy(false);
    if (result.ok) {
      setPlan(result.plan);
      return;
    }
    setServerErrors(result.errors);
    if (Object.keys(result.errors).length === 0) setFormError(result.message);
  }

  async function end() {
    setBusy(true);
    setFormError(null);
    const result = await endContractEarly(creatorId, period.contractId, request);
    setBusy(false);
    if (result.ok) {
      onEnded(result.plan);
      return;
    }
    if (Object.keys(result.errors).length > 0) {
      // Back to the form, where the refused field says why.
      setServerErrors(result.errors);
      setPlan(null);
      return;
    }
    setFormError(result.message);
  }

  if (plan) {
    return (
      <Modal
        title="Akhiri Kontrak?"
        eyebrow={creatorName}
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlan(null)} disabled={busy}>
              ‹ Kembali
            </Button>
            <Button variant="danger" onClick={end} disabled={busy}>
              {busy ? "Memproses…" : "Akhiri Kontrak"}
            </Button>
          </>
        }
      >
        {formError ? (
          <p role="alert" className={`mb-3 ${ALERT}`}>
            {formError}
          </p>
        ) : null}
        <Consequences plan={plan} form={form} />
        {confirmDialog}
      </Modal>
    );
  }

  const cancel = form.invoice === "cancel";
  return (
    <>
      <Modal
        title={`Akhiri Kontrak Lebih Awal — ${creatorName}`}
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Batal
            </Button>
            <Button variant="danger" onClick={preview} disabled={busy || Object.keys(errors).length > 0}>
              Lanjut
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-muted">
          {`Periode ${period.periodNumber} · ${formatContractWindow(period.startDate, period.endDate)}. Kolom bertanda * wajib diisi.`}
        </p>

        <div className="flex flex-col gap-3.5">
          <ChoiceGroup
            legend="Invoice Periode Ini"
            name="early-end-invoice"
            options={INVOICE_CHOICES}
            value={form.invoice}
            onChange={(invoice) => patch({ invoice }, "lastDay")}
          />

          {cancel ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="font-semibold">Hari Terakhir</span>
              <span className="rounded-(--radius-control) border border-rule bg-surface-2 px-3 py-1.5">
                {formatDate(today)}
              </span>
              <span className="text-xs text-muted">Invoice dibatalkan, jadi kontrak berakhir hari ini.</span>
            </div>
          ) : (
            <Field
              label="Hari Terakhir"
              error={fieldError("lastDay")}
              hint={
                dayWindow
                  ? { label: "Info Hari Terakhir", text: `Antara ${formatDate(dayWindow.min)} dan ${formatDate(dayWindow.max)}.` }
                  : undefined
              }
            >
              <input
                type="date"
                className={FIELD}
                required
                min={dayWindow?.min}
                max={dayWindow?.max}
                value={form.lastDay}
                onChange={(event) => patch({ lastDay: event.target.value }, "lastDay")}
                onBlur={() => touch("lastDay")}
              />
            </Field>
          )}

          <Field label="Alasan" error={fieldError("reason")}>
            <select
              className={FIELD}
              required
              value={form.reason}
              onChange={(event) => patch({ reason: event.target.value as EarlyEndReason | "" }, "reason")}
              onBlur={() => touch("reason")}
            >
              <option value="">Pilih alasan</option>
              {(Object.keys(EARLY_END_REASON_LABELS) as EarlyEndReason[]).map((reason) => (
                <option key={reason} value={reason}>
                  {EARLY_END_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Catatan"
            error={fieldError("note")}
            hint={{ label: "Info Catatan", text: "Hanya terlihat oleh Admin." }}
            note={<CharLimit id={noteCountId} length={form.note.length} max={NOTE_MAX} />}
          >
            <textarea
              className={FIELD}
              rows={3}
              required
              maxLength={NOTE_MAX}
              placeholder="mis. Konten diunggah ulang dari creator lain"
              aria-describedby={noteCountId}
              value={form.note}
              onChange={(event) => patch({ note: event.target.value }, "note")}
              onBlur={() => touch("note")}
            />
          </Field>

          {upcoming.length > 0 ? (
            <ChoiceGroup
              legend={`${upcoming.map((next) => `Periode ${next.periodNumber}`).join(", ")} belum dimulai`}
              name="early-end-upcoming"
              options={UPCOMING_CHOICES}
              value={form.upcomingPeriods}
              error={fieldError("upcomingPeriods")}
              onChange={(upcomingPeriods) => patch({ upcomingPeriods }, "upcomingPeriods")}
            />
          ) : null}

          {formError ? (
            <p role="alert" className={ALERT}>
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
      {confirmDialog}
    </>
  );
}
