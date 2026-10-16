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

/**
 * The filter bar over the Rate & Invoicing table: by creator name, by where their contract
 * stands and by where the invoice stands, as the prototype filters it. It reads and writes the
 * address through the shared hook, so a pick is one replace away and drops the old page number.
 */
export function InvoiceFilters() {
  const { search, setSearch, param, setParam, reset, pending } = useUrlFilters();

  // Read from what the address holds, typed or not, so Reset is offered to clear it all.
  const isFilteredNow =
    search !== "" || param("q") !== "all" || param("contract") !== "all" || param("status") !== "all";

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

      <ResetFilters onReset={reset} disabled={pending || !isFilteredNow} />
    </div>
  );
}
