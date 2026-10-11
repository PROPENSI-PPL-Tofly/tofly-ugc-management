"use client";

import {
  FilterSelect,
  OVERDUE_OPTIONS,
  PeriodFilter,
  ResetFilters,
  SearchBox,
} from "@/components/filters/filter-controls";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  PERIOD_FREE_MY_TAB,
  myStatusOptionsFor,
  taskStatusLabel,
  type MyTasksParams,
} from "@/lib/my-tasks";
import { useUrlFilters } from "@/lib/use-url-filters";

const TYPE_OPTIONS: MultiSelectOption[] = (
  Object.keys(CONTENT_TYPE_LABELS) as Array<keyof typeof CONTENT_TYPE_LABELS>
).map((value) => ({ value, label: CONTENT_TYPE_LABELS[value] }));

/**
 * Task Saya's filter bar: the search, Tipe, Status, Overdue and Periode, as in the admin
 * Content Plan. The server hands in the validated tab, so the status choices stay scoped to
 * what the tab can hold (hidden where that is a single status) and Overdue leaves Selesai,
 * where nothing waits any more. Every control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on.
 */
export function MyTaskFilters({ state }: Readonly<{ state: MyTasksParams }>) {
  const { search, setSearch, param, setParam, resetKeeping, pending } = useUrlFilters();

  const statusOptions: MultiSelectOption[] = myStatusOptionsFor(state.tab).map((value) => ({
    value,
    label: taskStatusLabel(value),
  }));

  /** A multi-select parameter as the array the chips hold, empty when it is not applied. */
  function listParam(key: string): string[] {
    const raw = param(key);
    return raw === "all" ? [] : raw.split(",").filter((part) => part !== "");
  }

  const isFilteredNow =
    search !== "" ||
    listParam("type").length > 0 ||
    listParam("status").length > 0 ||
    param("overdue") !== "all" ||
    param("period") !== "all";

  const day = (key: string) => (param(key) === "all" ? "" : param(key));

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <SearchBox label="Cari judul konten" value={search} onChange={setSearch} />

      <MultiSelect
        label="Tipe"
        options={TYPE_OPTIONS}
        selected={listParam("type")}
        onChange={(next) => setParam("type", next.join(","))}
      />

      {statusOptions.length > 1 ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={listParam("status")}
          onChange={(next) => setParam("status", next.join(","))}
        />
      ) : null}

      {state.tab === "done" ? null : (
        <FilterSelect
          label="Overdue"
          value={param("overdue")}
          options={OVERDUE_OPTIONS}
          onChange={(value) => setParam("overdue", value)}
        />
      )}

      <PeriodFilter
        period={param("period")}
        from={day("from")}
        to={day("to")}
        ignored={state.tab === PERIOD_FREE_MY_TAB && param("period") !== "all"}
        onChange={setParam}
      />

      {isFilteredNow ? (
        <ResetFilters
          onReset={() => resetKeeping(state.tab === "all" ? {} : { tab: state.tab })}
          disabled={pending}
        />
      ) : null}
    </div>
  );
}
