"use client";

import { useState } from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { InfoTip } from "@/components/ui/info-tip";
import { NUMERIC_INPUT, digitsOnly } from "@/components/ui/form-classes";
import DeadlinePreview from "./deadline-preview";
import {
  BUFFER_DAYS,
  CONTRACT_TYPE_LABELS,
  contractDateLimits,
  scheduleDeadlines,
  type ContractTermsInput,
  type ContractType,
} from "@/lib/creator-form";
import {
  addManualDeadline,
  allocateDeadlines,
  NO_PICKS,
  removeManualDeadline,
  toggleAutoDeadline,
  type Allocation,
  type SlotPicks,
} from "@/lib/deadline-allocation";
import { getBufferWindow } from "@/lib/deadline-schedule";
import { formatDate } from "@/lib/format";
import { latestDeadline } from "@/lib/platform-links";

// A contract's terms and its Evergreen calendar, as Tambah Creator and Perpanjang Kontrak (PBI-30
// AC 2: "the same rules as Tambah Creator") both ask for them. One component, so the two forms
// can never drift apart in a field, a limit or a message.

export const ALERT =
  "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";

// Same field styling as the filter bar's inputs, for a consistent form control vocabulary.
export const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

// Every field but the two usernames is required, so its label carries the asterisk; the control
// itself still sets `required` for assistive tech.
export function Field({
  label,
  error,
  note,
  hint,
  optional = false,
  children,
}: {
  label: string;
  /** Left without the asterisk: the usernames, which the creator's connecting fills in later. */
  optional?: boolean;
  error?: string;
  /** Rendered outside the label so it stays out of the control's accessible name. */
  note?: React.ReactNode;
  /** What the field means, behind an ⓘ at the end of the label row; outside the label so the
   *  explanation stays out of the control's accessible name. */
  hint?: { label: string; text: string };
  children: React.ReactNode;
}) {
  return (
    // The message sits outside the label so it never becomes part of the input's name.
    <div className="relative flex flex-col gap-1 text-[13px]">
      {hint ? (
        <span className="absolute right-0 top-0">
          <InfoTip label={hint.label} text={hint.text} align="end" />
        </span>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          {label}
          {optional ? null : (
            <span aria-hidden="true" className="ml-0.5 text-red-ink">
              *
            </span>
          )}
        </span>
        {children}
      </label>
      {note}
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

/** Reads a digits-only field back into the number the form holds; empty is 0. */
function wholeNumber(value: string): number {
  const digits = digitsOnly(value);
  return digits === "" ? 0 : Number(digits);
}

export type TermField = keyof ContractTermsInput;

/**
 * The Evergreen calendar's state for a contract being filled in: what the admin unpicked or
 * added by hand, re-applied to whatever the terms now allow. Null until the terms can draw one.
 */
export function useDeadlineAllocation(terms: ContractTermsInput, today: string) {
  const [picks, setPicks] = useState<SlotPicks>(NO_PICKS);
  const schedule = scheduleDeadlines(terms, today);
  const allocation =
    schedule === null
      ? null
      : allocateDeadlines(
          {
            autoDeadlines: schedule.autoDeadlines,
            quota: terms.quota,
            firstAllowed: getBufferWindow({
              contractStart: terms.contractStart,
              today,
              bufferDays: BUFFER_DAYS,
            })
              .firstAllowedDate.toISOString()
              .slice(0, 10),
            contractEnd: latestDeadline(terms.contractEnd),
          },
          picks,
        );

  return { allocation, picks, setPicks };
}

/** The six terms of a contract, in the order and wording of Tambah Creator. */
export function ContractTermsFields({
  terms,
  today,
  fieldError,
  onChange,
  onDateChange,
  onBlur,
  fixedRateHint,
}: {
  terms: ContractTermsInput;
  today: string;
  fieldError: (field: TermField) => string | undefined;
  /** One term changed, as a patch of the terms: typed per field without a cast. */
  onChange: (patch: Partial<ContractTermsInput>) => void;
  /** A date is picked, not typed: its verdict is due as soon as it changes. */
  onDateChange: (field: "contractStart" | "contractEnd", value: string) => void;
  onBlur: (field: TermField) => void;
  /** What the fixed rate means in this form: a first period's rate, or a renewal's. */
  fixedRateHint: string;
}) {
  const limits = contractDateLimits(terms, today);

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Field label="Jenis Kontrak" error={fieldError("contractType")}>
        <select
          className={FIELD}
          required
          value={terms.contractType}
          onChange={(event) => onChange({ contractType: event.target.value as ContractType | "" })}
          onBlur={() => onBlur("contractType")}
        >
          <option value="">Pilih jenis kontrak</option>
          {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((type) => (
            <option key={type} value={type}>
              {CONTRACT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Fixed Rate Kontrak (Rp)"
        error={fieldError("fixedRate")}
        hint={{ label: "Info Fixed Rate Kontrak", text: fixedRateHint }}
      >
        <AmountInput
          className={FIELD}
          required
          placeholder="mis. 5000000"
          value={terms.fixedRate}
          onChange={(value) => onChange({ fixedRate: value })}
          onBlur={() => onBlur("fixedRate")}
        />
      </Field>

      <Field label="Mulai Kontrak" error={fieldError("contractStart")}>
        <input
          type="date"
          className={FIELD}
          required
          min={limits.startMin}
          max={limits.startMax}
          value={terms.contractStart}
          onChange={(event) => onDateChange("contractStart", event.target.value)}
          onBlur={() => onBlur("contractStart")}
        />
      </Field>

      <Field label="Akhir Kontrak" error={fieldError("contractEnd")}>
        <input
          type="date"
          className={FIELD}
          required
          min={limits.endMin}
          value={terms.contractEnd}
          onChange={(event) => onDateChange("contractEnd", event.target.value)}
          onBlur={() => onBlur("contractEnd")}
        />
      </Field>

      <Field label="Jumlah konten yang disepakati" error={fieldError("quota")}>
        <input
          {...NUMERIC_INPUT}
          className={FIELD}
          required
          placeholder="mis. 6"
          value={emptyIfZero(terms.quota)}
          onChange={(event) => onChange({ quota: wholeNumber(event.target.value) })}
          onBlur={() => onBlur("quota")}
        />
      </Field>

      <Field label="Jarak antar-deadline (hari)" error={fieldError("interval")}>
        <input
          {...NUMERIC_INPUT}
          className={FIELD}
          required
          value={emptyIfZero(terms.interval)}
          onChange={(event) => onChange({ interval: wholeNumber(event.target.value) })}
          onBlur={() => onBlur("interval")}
        />
      </Field>
    </div>
  );
}

/** The Evergreen calendar under the terms, or a hint while the dates cannot draw one yet. */
export function DeadlineSchedule({
  terms,
  today,
  allocation,
  show,
  setPicks,
  error,
}: {
  terms: ContractTermsInput;
  today: string;
  allocation: Allocation | null;
  /** Only once the dates it draws are ones that could be saved. */
  show: boolean;
  setPicks: React.Dispatch<React.SetStateAction<SlotPicks>>;
  /** The server's message about the deadlines from the last rejected save. */
  error?: string;
}) {
  const remaining = allocation?.remaining ?? 0;

  return (
    <>
      {!show || allocation === null ? (
        <p className="rounded-(--radius-control) border border-dashed border-rule bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
          Lengkapi tanggal kontrak yang valid untuk melihat jadwal deadline.
        </p>
      ) : (
        <div className="mt-1">
          <DeadlinePreview
            contractStart={terms.contractStart}
            contractEnd={terms.contractEnd}
            lastDeadline={latestDeadline(terms.contractEnd)}
            today={today}
            bufferDays={BUFFER_DAYS}
            autoDeadlines={allocation.auto}
            manualDeadlines={allocation.manual}
            allocatedCount={allocation.deadlines.length}
            remainingCount={remaining}
            quota={terms.quota}
            onToggleAuto={(day) => setPicks((prev) => toggleAutoDeadline(prev, day))}
            onAddManual={(day) => setPicks((prev) => addManualDeadline(prev, day, remaining))}
          />

          {remaining > 0 ? (
            <p role="status" className="mt-3 text-[13px] text-amber-ink">
              Sisa {remaining} konten belum punya deadline. Pilih tanggalnya di kalender.
            </p>
          ) : null}

          {allocation.manual.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Deadline manual">
              {[...new Set(allocation.manual)].map((day) => {
                const count = allocation.manual.filter((picked) => picked === day).length;
                return (
                  <li
                    key={day}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-wash px-3 py-0.5 text-xs font-semibold text-accent-deep"
                  >
                    {formatDate(day)}
                    {count > 1 ? ` ×${count}` : ""}
                    <button
                      type="button"
                      aria-label={`Hapus deadline manual ${formatDate(day)}`}
                      onClick={() => setPicks((prev) => removeManualDeadline(prev, day))}
                      className="ml-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className={`mt-3 ${ALERT}`}>
          {error}
        </p>
      ) : null}
    </>
  );
}
