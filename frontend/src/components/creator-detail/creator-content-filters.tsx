"use client";

import {
  FilterSelect,
  OVERDUE_OPTIONS,
  ResetFilters,
  SearchBox,
  offeredPicks,
} from "@/components/filters/filter-controls";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import { statusOptionsFor, type ContentPlanTab } from "@/lib/content-plan";
import { useUrlFilters } from "@/lib/use-url-filters";

/** A label map as the choices of a multi-select, in the order the map names them. */
function optionsOf(labels: Readonly<Record<string, string>>): MultiSelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

// Built from the label map, so a type added to the content is a choice here as well.
const TYPE_OPTIONS = optionsOf(CONTENT_TYPE_LABELS);

/**
 * The filter bar over a period's content, the Content Plan's without the creator and the
 * period: the period is the tab above, the creator the page itself. The status choices stay
 * scoped to the tab (hidden where that is a single status) and Overdue leaves Selesai, where
 * nothing waits any more. It reads and writes the address through the shared hook, so a pick
 * is one replace away, drops the old page number and leaves the open period where it is.
 */
export function CreatorContentFilters({ tab }: Readonly<{ tab: ContentPlanTab }>) {
  const { search, setSearch, param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

  const statusOptions: MultiSelectOption[] = statusOptionsFor(tab).map((value) => ({
    value,
    label: CONTENT_STATUS_LABELS[value],
  }));

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  /** Clears the search and the filters, but the period and the tab being read survive. */
  function resetKeepingPeriod() {
    const contract = param("contract");
    resetKeeping({
      ...(contract === "all" ? {} : { contract }),
      ...(tab === "all" ? {} : { tab }),
    });
  }

  // Read from what the address holds, offered or not, so Reset is there to clear it all.
  const isFilteredNow =
    search !== "" ||
    param("type") !== "all" ||
    param("status") !== "all" ||
    param("overdue") !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <SearchBox label="Cari judul konten" value={search} onChange={setSearch} />

      <MultiSelect
        label="Tipe"
        options={TYPE_OPTIONS}
        selected={offeredPicks(listParam("type"), TYPE_OPTIONS)}
        onChange={(next) => setListParam("type", next)}
      />

      {statusOptions.length > 1 ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={offeredPicks(listParam("status"), statusOptions)}
          onChange={(next) => setListParam("status", next)}
        />
      ) : null}

      {tab === "done" ? null : (
        <FilterSelect
          label="Overdue"
          value={param("overdue")}
          options={OVERDUE_OPTIONS}
          onChange={(value) => setParam("overdue", value)}
        />
      )}

      {isFilteredNow ? <ResetFilters onReset={resetKeepingPeriod} disabled={pending} /> : null}
    </div>
  );
}
