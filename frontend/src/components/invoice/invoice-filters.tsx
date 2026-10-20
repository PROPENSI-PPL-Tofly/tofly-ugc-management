"use client";

import {
  FilterSelect,
  ResetFilters,
  SearchBox,
  type FilterOption,
} from "@/components/filters/filter-controls";
import { CONTRACT_STATUS_LABELS, INVOICE_STATUS_LABELS } from "@/lib/invoice";
import { useUrlFilters } from "@/lib/use-url-filters";

/** A label map as the choices of a select, in the order the map names them. */
function optionsOf(labels: Readonly<Record<string, string>>): FilterOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const CONTRACT_OPTIONS: FilterOption[] = [
  { value: "all", label: "Semua" },
  ...optionsOf(CONTRACT_STATUS_LABELS),
];

const INVOICE_OPTIONS: FilterOption[] = [
  { value: "all", label: "Semua" },
  ...optionsOf(INVOICE_STATUS_LABELS),
];

/** Every address parameter the bar's Reset clears: the search, both filters and the sort. */
const RESETTABLE = ["q", "contract", "status", "sort", "order"] as const;

/**
 * The filter bar over the Rate & Invoicing table: by creator name, by where their contract
 * stands and by where the invoice stands, as the prototype filters it. It reads and writes the
 * address through the shared hook, so a pick is one replace away and drops the old page number.
 */
export function InvoiceFilters() {
  const { search, setSearch, param, setParam, reset, pending } = useUrlFilters();

  // Read from what the address holds, typed or not, so Reset is offered to clear it all. The
  // sort headers write the same address and Reset clears them too, so a changed sort counts.
  const isFilteredNow =
    search !== "" || RESETTABLE.some((key) => param(key) !== "all");

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <SearchBox label="Cari nama creator" value={search} onChange={setSearch} />

      <FilterSelect
        label="Kontrak"
        value={param("contract")}
        options={CONTRACT_OPTIONS}
        onChange={(value) => setParam("contract", value)}
      />

      <FilterSelect
        label="Invoice"
        value={param("status")}
        options={INVOICE_OPTIONS}
        onChange={(value) => setParam("status", value)}
      />

      {/* Left out until there is something to clear, as on Creator Database. */}
      {isFilteredNow ? <ResetFilters onReset={reset} disabled={pending} /> : null}
    </div>
  );
}
