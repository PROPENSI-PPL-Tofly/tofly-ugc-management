"use client";

import { ResetFilters } from "@/components/filters/filter-controls";
import { PHONE_TARGET } from "@/components/ui/touch-target";

/**
 * The bar's active picks, gathered in one row below the filters (the benchmark's layout): each
 * chip says which filter it came from — "Creator: Adit Prakoso" — so a pick can never be
 * mistaken for another filter's, and one chip can be dropped without reopening anything.
 * Reset sits beside them, in the app's own wording, and clears the whole bar in one press.
 *
 * Presentational only: the bar reads and writes the URL itself and hands each chip in, so every
 * filter bar (Content Plan, Task Saya, Creator Detail) lays its picks out the same way.
 */

export interface FilterChip {
  /** Stable per pick, e.g. "Creator:<value>". */
  id: string;
  /** The filter's own name, as the bar labels its control. */
  filterLabel: string;
  /** The pick, as its option reads; the raw value when the option is gone. */
  valueLabel: string;
  onRemove: () => void;
}

/**
 * Picks of one multi-select as chips, each named for its filter. A pick whose option has
 * disappeared reads as its raw value rather than vanishing.
 */
export function pickedChips(
  filterLabel: string,
  values: readonly string[],
  options: readonly { value: string; label: string }[],
  onRemove: (value: string) => void,
): FilterChip[] {
  return values.map((value) => ({
    id: `${filterLabel}:${value}`,
    filterLabel,
    valueLabel: options.find((option) => option.value === value)?.label ?? value,
    onRemove: () => onRemove(value),
  }));
}

/**
 * A one-choice filter in use as its chip: none while its first, all-inclusive choice holds (or for
 * a value it does not offer), so it reads like a multi-select's picks under the bar.
 */
export function choiceChip(
  filterLabel: string,
  value: string,
  options: readonly { value: string; label: string }[],
  onClear: () => void,
): FilterChip[] {
  if (options.length === 0 || value === options[0].value) return [];
  const option = options.find((candidate) => candidate.value === value);
  return option
    ? [{ id: `${filterLabel}:${value}`, filterLabel, valueLabel: option.label, onRemove: onClear }]
    : [];
}

const CHIP = `inline-flex max-w-full items-center gap-1 rounded-full border border-rule bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2 ${PHONE_TARGET}`;

export function FilterChips({
  chips,
  onReset,
  canReset,
  resetDisabled = false,
}: Readonly<{
  chips: readonly FilterChip[];
  /** Clears the whole bar; only the bar knows how. */
  onReset: () => void;
  /** Something is filtered, whether or not it is a chip (a search word, a single select). */
  canReset: boolean;
  /** A change is still on its way, so a reset would race it. */
  resetDisabled?: boolean;
}>) {
  if (chips.length === 0 && !canReset) return null;

  return (
    // On a phone the chips wrap inside their own group, so Reset keeps its place beside them on
    // the first line rather than dropping onto a line of its own.
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-5 py-3 max-sm:flex-nowrap max-sm:items-start">
      <div
        role="group"
        aria-label="Filter aktif"
        className="flex flex-wrap items-center gap-2 max-sm:min-w-0 max-sm:flex-1"
      >
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-label={`Hapus filter ${chip.filterLabel}: ${chip.valueLabel}`}
            onClick={chip.onRemove}
            className={`${CHIP} cursor-pointer hover:border-ink-2`}
          >
            <span className="max-w-40 truncate">
              {`${chip.filterLabel}: ${chip.valueLabel}`}
            </span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>

      {canReset ? <ResetFilters onReset={onReset} disabled={resetDisabled} /> : null}
    </div>
  );
}
