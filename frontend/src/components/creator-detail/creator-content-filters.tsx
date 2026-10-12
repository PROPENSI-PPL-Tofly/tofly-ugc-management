"use client";

import { ResetFilters, offeredPicks } from "@/components/filters/filter-controls";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import { useUrlFilters } from "@/lib/use-url-filters";

/** A label map as the choices of a multi-select, in the order the map names them. */
function optionsOf(labels: Readonly<Record<string, string>>): MultiSelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

// Built from the label maps, so a status added to the lifecycle is a choice here as well.
const TYPE_OPTIONS = optionsOf(CONTENT_TYPE_LABELS);
const STATUS_OPTIONS = optionsOf(CONTENT_STATUS_LABELS);

/**
 * The filter bar over a period's content: by type and by status, as 4.2 asks. It reads and
 * writes the address through the shared hook, so a pick is one replace away, drops the old
 * page number and leaves the open period where it is.
 */
export function CreatorContentFilters() {
  const { param, setParam, resetKeeping, pending } = useUrlFilters();

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  /** Clears both filters, but the period the admin is looking at survives. */
  function resetKeepingPeriod() {
    const contract = param("contract");
    resetKeeping(contract === "all" ? {} : { contract });
  }

  // Read from what the address holds, offered or not, so Reset is there to clear it all.
  const isFilteredNow = param("type") !== "all" || param("status") !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <MultiSelect
        label="Tipe"
        options={TYPE_OPTIONS}
        selected={offeredPicks(param("type"), TYPE_OPTIONS)}
        onChange={(next) => setListParam("type", next)}
      />

      <MultiSelect
        label="Status"
        options={STATUS_OPTIONS}
        selected={offeredPicks(param("status"), STATUS_OPTIONS)}
        onChange={(next) => setListParam("status", next)}
      />

      {isFilteredNow ? <ResetFilters onReset={resetKeepingPeriod} disabled={pending} /> : null}
    </div>
  );
}
