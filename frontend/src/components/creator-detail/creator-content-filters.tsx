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

function optionsOf(labels: Readonly<Record<string, string>>): MultiSelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const TYPE_OPTIONS = optionsOf(CONTENT_TYPE_LABELS);

/** Period-scoped filters following Content Plan's search, status, and Overdue conventions. */
export function CreatorContentFilters({ tab = "all" }: Readonly<{ tab?: ContentPlanTab }>) {
  const { search, setSearch, param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

  const statusOptions: MultiSelectOption[] = statusOptionsFor(tab).map((value) => ({
    value,
    label: CONTENT_STATUS_LABELS[value],
  }));

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  function resetKeepingPeriodAndTab() {
    const contract = param("contract");
    resetKeeping({
      ...(contract === "all" ? {} : { contract }),
      ...(tab === "all" ? {} : { tab }),
    });
  }

  const filtered =
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
      {filtered ? <ResetFilters onReset={resetKeepingPeriodAndTab} disabled={pending} /> : null}
    </div>
  );
}
