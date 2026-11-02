"use client";

import { useId, useState, type ReactNode } from "react";
import { PHONE_TARGET } from "@/components/ui/touch-target";
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

export const FILTER_FIELD = `rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink ${PHONE_TARGET}`;

// Side by side from sm up; inside the open phone card, the name over a full-width control.
const LABEL = "flex items-center gap-2 text-[13px] max-sm:flex-col max-sm:items-stretch";

/** The search box; `label` names it and, with an ellipsis, is its placeholder too. */
export function SearchBox({
  label,
  placeholder = `${label}…`,
  value,
  onChange,
}: Readonly<{
  label: string;
  /** What the empty box says; the label with an ellipsis unless the bar has better words. */
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <input
      type="search"
      placeholder={placeholder}
      aria-label={label}
      maxLength={MAX_SEARCH_LENGTH}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // On a phone the box shares its row with the Filter press, taking what the press leaves.
      className={`${FILTER_FIELD} w-52 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1`}
    />
  );
}

// A select whose choice is not its first (the "all" one) is a filter in use: it stands out.
const FIELD_ACTIVE = "data-active:border-accent data-active:bg-accent-wash data-active:font-semibold data-active:text-accent-deep";

/**
 * A native select with its visible name beside it. A choice other than the first is a filter in
 * use: the select stands out and, on a phone, the name carries an "Aktif" tag (the folded bar
 * draws no chips, so the control says it itself). The tag sits outside the select's own name.
 */
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
  const active = options.length > 0 && value !== options[0].value;

  return (
    <label className={LABEL}>
      <span className="flex items-center gap-1.5 text-muted max-sm:font-bold max-sm:text-ink-2">
        {label}
        {active ? (
          <span className="rounded-full bg-accent px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-accent-ink sm:hidden">
            Aktif
          </span>
        ) : null}
      </span>
      <select
        aria-label={label}
        value={value}
        data-active={active ? "true" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${FILTER_FIELD} ${FIELD_ACTIVE}`}
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

const CHOICE = `inline-flex h-7 ${PHONE_TARGET} cursor-pointer items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink has-checked:bg-accent-wash has-checked:text-accent-deep has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent`;

/**
 * One choice out of a few, as native radios in a named group: Tab reaches the group once, the
 * arrow keys move the choice, and the chosen one reads as picked. Drawn as one segmented pill,
 * so it sits in the bar like the multi-select pills beside it and fits a phone's row.
 */
export function FilterRadio({
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
  const name = useId();

  return (
    <fieldset className="flex items-center gap-2 border-0 p-0">
      <legend className="float-left text-[13px] text-muted">{label}</legend>
      <div className="inline-flex rounded-full border border-rule bg-surface p-0.5">
        {options.map((option) => (
          <label key={option.value} className={CHOICE}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
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
    <label className={`${LABEL} max-sm:flex-1 max-sm:gap-1`}>
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
  onClear,
}: Readonly<{
  from: string;
  to: string;
  onChange: (key: "from" | "to", value: string) => void;
  /** Clears both days in one change, so no address with one day left on it is opened. */
  onClear: () => void;
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
          onClick={onClear}
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
  onPeriod,
  onChange,
  onClear,
}: Readonly<{
  period: string;
  from: string;
  to: string;
  ignored: boolean;
  /** The period picked, for the bar to apply together with its days (useUrlFilters.setPeriod). */
  onPeriod: (period: string) => void;
  /** A custom day, under its own key. */
  onChange: (key: "period" | "from" | "to", value: string) => void;
  /** Clears both custom days in one change. */
  onClear: () => void;
}>) {
  return (
    <>
      <FilterSelect
        label="Periode"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={onPeriod}
      />

      {period === "custom" ? <DeadlineRange from={from} to={to} onChange={onChange} onClear={onClear} /> : null}

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
      className={`cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-60 ${PHONE_TARGET}`}
    >
      Reset
    </button>
  );
}

/**
 * One filter in use, as the folded bar counts it. Taking one off is done at its control, in the
 * open panel, since the bar draws no chips (approved design).
 */
export interface ActiveFilter {
  id: string;
  text: string;
}

/** Each pick of a multi-select as its own active filter: "Tipe: Evergreen". */
export function pickFilters(
  group: string,
  picks: readonly string[],
  options: readonly FilterOption[],
): ActiveFilter[] {
  return picks.map((value) => ({
    id: `${group}:${value}`,
    text: `${group}: ${options.find((option) => option.value === value)?.label ?? value}`,
  }));
}

/** The Overdue choice, under the select's own words for it. */
export function overdueFilter(value: string): ActiveFilter[] {
  const option = OVERDUE_OPTIONS.find((candidate) => candidate.value === value);
  return value === "all" || !option ? [] : [{ id: "overdue", text: option.label }];
}

/** A custom range in words, read the right way round as the list reads it. */
function rangeChip(from: string, to: string): string {
  if (from && to) {
    return `Deadline ${from > to ? formatContractWindow(to, from) : formatContractWindow(from, to)}`;
  }
  if (from) return `Deadline mulai ${formatDate(from)}`;
  if (to) return `Deadline sampai ${formatDate(to)}`;
  return "Periode: Pilih tanggal";
}

/**
 * The period: a named one, or the custom range in words. `ignored` says the open tab does not
 * narrow by period.
 */
export function periodFilter(
  period: string,
  from: string,
  to: string,
  ignored: boolean,
): ActiveFilter[] {
  const option = PERIOD_OPTIONS.find((candidate) => candidate.value === period);
  if (period === "all" || !option) return [];

  const text = period === "custom" ? rangeChip(from, to) : `Periode: ${option.label}`;
  return [{ id: "period", text: ignored ? `${text} (tidak berlaku di tab ini)` : text }];
}

const TOGGLE = `inline-flex h-8 ${PHONE_TARGET} cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-surface px-3 text-[12.5px] font-semibold text-ink transition-colors hover:border-ink active:bg-surface-2 aria-expanded:border-accent aria-expanded:bg-accent-wash sm:hidden`;

const TOGGLE_COUNT = "rounded-full bg-accent-wash px-1.5 text-[11px] font-semibold text-accent-deep";

// Open on a phone: one card under the search row (order-last keeps Reset in that row), a
// control per line. From sm up, display: contents leaves the controls in the bar's own row.
const PANEL_OPEN =
  "max-sm:order-last max-sm:flex max-sm:basis-full max-sm:flex-col max-sm:gap-3.5 max-sm:rounded-xl max-sm:border-[1.5px] max-sm:border-rule max-sm:bg-surface max-sm:p-3.5 max-sm:shadow-sm sm:contents";

/**
 * A list's filter bar. From sm up every control sits in one wrapping row, as it always has. On
 * a phone the controls fold behind one Filter button that counts what is active (and shows
 * itself pressed while open), so the list starts sooner; open, each control marks its own
 * choice, so no row of chips repeats them. The search and Reset stay outside the fold.
 */
export function FilterBar({
  search,
  active,
  reset,
  children,
}: Readonly<{
  search: ReactNode;
  active: readonly ActiveFilter[];
  reset: ReactNode;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3 max-sm:gap-2">
      {search}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // The count is read as a count, not as a bare number after the word.
        aria-label={active.length > 0 ? `Filter, ${active.length} aktif` : undefined}
        onClick={() => setOpen(!open)}
        className={TOGGLE}
      >
        Filter
        {active.length > 0 ? <span className={TOGGLE_COUNT}>{active.length}</span> : null}
      </button>

      <div id={panelId} className={open ? PANEL_OPEN : "contents max-sm:hidden"}>
        {children}
      </div>

      {reset}

    </div>
  );
}
