"use client";

import { useId } from "react";
import { formatContractWindow, formatDate } from "@/lib/format";
import { list } from "@/lib/search-params";
import { MAX_SEARCH_LENGTH } from "@/lib/use-url-filters";

// The pieces every list's filter bar is built from: the search box, a labelled select, the
// deadline period with its custom days, and Reset. Presentational only: each bar reads and
// writes the URL itself (useUrlFilters) and hands values in, so the admin Content Plan and Task
// Saya look and behave the same without sharing their state.

export interface FilterOption {
  value: string;
  label: string;
}

export const OVERDUE_OPTIONS: readonly FilterOption[] = [
  { value: "all", label: "Semua" },
  { value: "yes", label: "Overdue" },
  { value: "no", label: "Tidak overdue" },
];

const PERIOD_OPTIONS: readonly FilterOption[] = [
  { value: "all", label: "Semua periode" },
  { value: "month", label: "Bulan ini" },
  { value: "next30", label: "30 hari ke depan" },
  { value: "last90", label: "90 hari terakhir" },
  { value: "custom", label: "Pilih tanggal…" },
];

/**
 * A comma-separated multi-select parameter as the picks its control offers. The address can
 * name more (a typed or stale value, a status only another tab holds); the list ignores those,
 * so they are no pick in the bar either: no chip, and the next change leaves them behind.
 */
export function offeredPicks(raw: string, options: readonly FilterOption[]): string[] {
  // Split and trimmed as the server splits it, so the bar and the list never read it apart.
  return list(raw).filter((part) => options.some((option) => option.value === part));
}

export const FILTER_FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink";

const LABEL = "flex items-center gap-2 text-[13px]";

/** The search box; `label` names it and, with an ellipsis, is its placeholder too. */
export function SearchBox({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  return (
    <input
      type="search"
      placeholder={`${label}…`}
      aria-label={label}
      maxLength={MAX_SEARCH_LENGTH}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${FILTER_FIELD} w-52 max-sm:w-full`}
    />
  );
}

/** A native select with its visible name beside it. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
}>) {
  return (
    <label className={LABEL}>
      <span className="text-muted">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FILTER_FIELD}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DayField({
  label,
  value,
  min,
  max,
  describedBy,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  min?: string;
  max?: string;
  describedBy: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className={`${LABEL} max-sm:flex-1 max-sm:flex-col max-sm:items-stretch max-sm:gap-1`}>
      <span className="text-muted">{label}</span>
      <input
        type="date"
        aria-label={label}
        aria-describedby={describedBy}
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={FILTER_FIELD}
      />
    </label>
  );
}

/**
 * Which deadlines a custom range shows, in words. A range picked backwards is read the right way
 * round by the list (periodRange), and says so here rather than leaving the admin to wonder.
 */
function rangeSummary(from: string, to: string): string {
  if (from && to) {
    return from > to
      ? `Deadline mulai jatuh setelah deadline sampai, jadi dibaca ${formatContractWindow(to, from)}`
      : `Deadline ${formatContractWindow(from, to)}`;
  }
  if (from) return `Deadline mulai ${formatDate(from)}`;
  if (to) return `Deadline sampai ${formatDate(to)}`;
  return "Pilih salah satu atau kedua tanggal";
}

/**
 * The custom days, named for the deadlines they bound and grouped as one range. Each picker
 * stops at the other day, the line beneath says what is shown, and one press clears both.
 * Stacked on a phone, so neither picker is squeezed.
 */
function DeadlineRange({
  from,
  to,
  onChange,
}: Readonly<{
  from: string;
  to: string;
  onChange: (key: "from" | "to", value: string) => void;
}>) {
  const summaryId = useId();

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-0 p-0 max-sm:w-full">
      <legend className="float-left mr-1 text-[13px] font-semibold text-ink-2 max-sm:mb-1 max-sm:w-full">
        Rentang deadline
      </legend>
      <DayField
        label="Deadline mulai"
        value={from}
        max={to}
        describedBy={summaryId}
        onChange={(value) => onChange("from", value)}
      />
      <DayField
        label="Deadline sampai"
        value={to}
        min={from}
        describedBy={summaryId}
        onChange={(value) => onChange("to", value)}
      />
      {from || to ? (
        <button
          type="button"
          onClick={() => {
            onChange("from", "");
            onChange("to", "");
          }}
          className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Kosongkan tanggal
        </button>
      ) : null}
      <p
        id={summaryId}
        role="status"
        className={`basis-full text-xs ${from && to && from > to ? "text-amber-ink" : "text-muted"}`}
      >
        {rangeSummary(from, to)}
      </p>
    </fieldset>
  );
}

/**
 * The deadline period: a named period, or a deadline range once "Pilih tanggal…" is picked.
 * Every change comes back under the URL key it belongs to. `ignored` says the open tab never
 * narrows by period, so nobody wonders why the period changed nothing there.
 */
export function PeriodFilter({
  period,
  from,
  to,
  ignored,
  onChange,
}: Readonly<{
  period: string;
  from: string;
  to: string;
  ignored: boolean;
  onChange: (key: "period" | "from" | "to", value: string) => void;
}>) {
  return (
    <>
      <FilterSelect
        label="Periode"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={(value) => onChange("period", value)}
      />

      {period === "custom" ? <DeadlineRange from={from} to={to} onChange={onChange} /> : null}

      {/* amber-ink, not amber: the plain amber token is too light to read on white. */}
      {ignored ? (
        <span className="order-last basis-full text-xs font-semibold text-amber-ink">Periode tidak berlaku di tab ini</span>
      ) : null}
    </>
  );
}

/** Clears the search and every filter; held while a change is on its way. */
export function ResetFilters({
  onReset,
  disabled,
}: Readonly<{ onReset: () => void; disabled: boolean }>) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-60"
    >
      Reset
    </button>
  );
}
