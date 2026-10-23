"use client";

/**
 * The bar's active picks, gathered in one row below the filters (the benchmark's layout): each
 * chip says which filter it came from — "Creator: Adit Prakoso" — so a pick can never be
 * mistaken for another filter's, and one chip can be dropped without reopening anything.
 * Atur ulang sits beside them and clears the whole bar in one press.
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

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-rule bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2";

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
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-5 py-3">
      <div role="group" aria-label="Filter aktif" className="flex flex-wrap items-center gap-2">
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

      {canReset ? (
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-60"
        >
          Atur ulang
        </button>
      ) : null}
    </div>
  );
}
