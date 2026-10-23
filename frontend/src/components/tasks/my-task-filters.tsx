"use client";

import {
  FilterSelect,
  OVERDUE_OPTIONS,
  PeriodFilter,
  SearchBox,
  offeredPicks,
} from "@/components/filters/filter-controls";
import { FilterChips, pickedChips } from "@/components/ui/filter-chips";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  PERIOD_FREE_MY_TAB,
  myStatusOptionsFor,
  taskStatusLabel,
  type MyTasksParams,
} from "@/lib/my-tasks";
import { taskViewParams, type TaskView } from "@/lib/task-view";
import { useUrlFilters } from "@/lib/use-url-filters";

const TYPE_OPTIONS: MultiSelectOption[] = (
  Object.keys(CONTENT_TYPE_LABELS) as Array<keyof typeof CONTENT_TYPE_LABELS>
).map((value) => ({ value, label: CONTENT_TYPE_LABELS[value] }));

/**
 * Task Saya's filter bar: the search, Tipe, Status, Overdue and Periode, as in the admin
 * Content Plan. The calendar leaves Periode out: its month is already the period on show. The server hands in the validated tab, so the status choices stay scoped to
 * what the tab can hold (hidden where that is a single status) and Overdue leaves Selesai,
 * where nothing waits any more. Every control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on. The view is in the same
 * URL, so a pick made on the calendar leaves the calendar open, and so does Reset.
 */
export function MyTaskFilters({
  state,
  view = "table",
}: Readonly<{
  state: MyTasksParams;
  /** The view being shown, kept when the filters are reset. */
  view?: TaskView;
}>) {
  const { search, setSearch, param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

  const statusOptions: MultiSelectOption[] = myStatusOptionsFor(state.tab).map((value) => ({
    value,
    label: taskStatusLabel(value),
  }));

  const withPeriod = view !== "calendar";

  // Read from what the address holds, offered or not, so Reset is there to clear it all. A
  // period in a calendar link narrows nothing there, so it asks for no Reset.
  const isFilteredNow =
    search !== "" ||
    param("type") !== "all" ||
    param("status") !== "all" ||
    param("overdue") !== "all" ||
    (withPeriod && param("period") !== "all");

  const day = (key: string) => (param(key) === "all" ? "" : param(key));

  const typePicks = offeredPicks(listParam("type"), TYPE_OPTIONS);
  const statusPicks = offeredPicks(listParam("status"), statusOptions);

  function resetKeepingTabAndView() {
    resetKeeping({
      ...(state.tab === "all" ? {} : { tab: state.tab }),
      ...taskViewParams(view),
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
        <SearchBox label="Cari judul konten" value={search} onChange={setSearch} />

        <MultiSelect
          label="Tipe"
          options={TYPE_OPTIONS}
          selected={typePicks}
          onChange={(next) => setParam("type", next.join(","))}
        />

        {statusOptions.length > 1 ? (
          <MultiSelect
            label="Status"
            options={statusOptions}
            selected={statusPicks}
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

        {withPeriod ? (
          <PeriodFilter
            period={param("period")}
            from={day("from")}
            to={day("to")}
            ignored={state.tab === PERIOD_FREE_MY_TAB && param("period") !== "all"}
            onChange={setParam}
          />
        ) : null}
      </div>

      {/* Every pick named after its filter, gathered below the bar as the benchmark lays them. */}
      <FilterChips
        chips={[
          ...pickedChips("Tipe", typePicks, TYPE_OPTIONS, (value) =>
            setParam(
              "type",
              typePicks.filter((pick) => pick !== value).join(","),
            ),
          ),
          ...(statusOptions.length > 1
            ? pickedChips("Status", statusPicks, statusOptions, (value) =>
                setParam(
                  "status",
                  statusPicks.filter((pick) => pick !== value).join(","),
                ),
              )
            : []),
        ]}
        canReset={isFilteredNow}
        resetDisabled={pending}
        onReset={resetKeepingTabAndView}
      />
    </>
  );
}
