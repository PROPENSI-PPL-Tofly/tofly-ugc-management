"use client";

import {
  FilterBar,
  FilterSelect,
  ResetFilters,
  SearchBox,
  type ActiveFilter,
  type FilterOption,
} from "@/components/filters/filter-controls";
import { CONTRACT_STATUS_FILTERS, PRODUCTIVITY_FILTERS } from "@/lib/creators";
import { useUrlFilters } from "@/lib/use-url-filters";

const CONTRACT_LABELS: Record<(typeof CONTRACT_STATUS_FILTERS)[number], string> = {
  all: "Semua",
  active: "Aktif",
  expired: "Berakhir",
  upcoming: "Belum mulai",
};

const PRODUCTIVITY_LABELS: Record<(typeof PRODUCTIVITY_FILTERS)[number], string> = {
  all: "Semua",
  good: "Baik",
  watch: "Perlu Perhatian",
  risk: "Berisiko",
  no_data: "Belum Ada Data",
};

const CONTRACT_OPTIONS: FilterOption[] = CONTRACT_STATUS_FILTERS.map((value) => ({
  value,
  label: CONTRACT_LABELS[value],
}));

const PRODUCTIVITY_OPTIONS: FilterOption[] = PRODUCTIVITY_FILTERS.map((value) => ({
  value,
  label: PRODUCTIVITY_LABELS[value],
}));

/** A select in use as the folded bar counts it: "Produktivitas: Berisiko". */
function selectFilter(
  key: string,
  label: string,
  value: string,
  options: readonly FilterOption[],
): ActiveFilter[] {
  const option = options.find((candidate) => candidate.value === value);
  return value === "all" || !option ? [] : [{ id: key, text: `${label}: ${option.label}` }];
}

/**
 * The Creator Database's filter bar, on the same FilterBar as Task Saya and the Content Plan:
 * from sm up the search and both selects share one row; on a phone the selects fold behind one
 * Filter press that counts the ones in use, so the search keeps the row to itself.
 */
export function CreatorFilters() {
  const { search, setSearch, param, setParam, reset, pending } = useUrlFilters();
  const contractStatus = param("contractStatus");
  const productivity = param("productivity");
  const isFiltered = search !== "" || contractStatus !== "all" || productivity !== "all";

  // What the folded phone bar counts, in the order of the controls.
  const active = [
    ...selectFilter("productivity", "Produktivitas", productivity, PRODUCTIVITY_OPTIONS),
    ...selectFilter("contractStatus", "Status kontrak", contractStatus, CONTRACT_OPTIONS),
  ];

  return (
    <FilterBar
      search={<SearchBox label="Cari creator" placeholder="Nama atau email…" value={search} onChange={setSearch} />}
      active={active}
      reset={isFiltered ? <ResetFilters onReset={reset} disabled={pending} /> : null}
    >
      <FilterSelect
        label="Produktivitas"
        value={productivity}
        options={PRODUCTIVITY_OPTIONS}
        onChange={(value) => setParam("productivity", value)}
      />

      <FilterSelect
        label="Status kontrak"
        value={contractStatus}
        options={CONTRACT_OPTIONS}
        onChange={(value) => setParam("contractStatus", value)}
      />
    </FilterBar>
  );
}
