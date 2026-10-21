"use client";

import {
  FilterBar,
  FilterRadio,
  FilterSelect,
  OVERDUE_OPTIONS,
  PeriodFilter,
  ResetFilters,
  SearchBox,
  offeredPicks,
  overdueFilter,
  periodFilter,
  pickFilters,
} from "@/components/filters/filter-controls";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { TabChoice } from "@/components/ui/tab-choice";
import { CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  MY_TASK_TABS,
  PERIOD_FREE_MY_TAB,
  myStatusOptionsFor,
  taskStatusLabel,
  type MyTasksCounts,
  type MyTasksParams,
} from "@/lib/my-tasks";
import { taskViewParams, type TaskView } from "@/lib/task-view";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useMyTaskTabSelect } from "./my-task-tab-bar";

const TYPE_OPTIONS: MultiSelectOption[] = (
  Object.keys(CONTENT_TYPE_LABELS) as Array<keyof typeof CONTENT_TYPE_LABELS>
).map((value) => ({ value, label: CONTENT_TYPE_LABELS[value] }));

/** Tipe is one choice: every type, or one of them. */
const TYPE_CHOICES = [{ value: "all", label: "Semua" }, ...TYPE_OPTIONS];

/**
 * Task Saya's filter bar: the search, Tipe, Status, Overdue and Periode, as in the admin
 * Content Plan. The server hands in the validated tab, so the status choices stay scoped to
 * what the tab can hold (hidden where that is a single status) and Overdue leaves Selesai,
 * where nothing waits any more. Every control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on. The view is in the same
 * URL, so a pick made on the calendar leaves the calendar open, and so does Reset. On a phone
 * the tabs are folded in too, as the Tampilkan choice, switched exactly as the row switches them.
 */
export function MyTaskFilters({
  state,
  counts,
  view = "table",
}: Readonly<{
  state: MyTasksParams;
  /** Each tab's size, named in the phone's Tampilkan choice. */
  counts: MyTasksCounts;
  /** The view being shown, kept when the filters are reset. */
  view?: TaskView;
}>) {
  const { search, setSearch, param, listParam, setParam, setParams, setPeriod, resetKeeping, pending } =
    useUrlFilters();
  const selectTab = useMyTaskTabSelect();

  const statusOptions: MultiSelectOption[] = myStatusOptionsFor(state.tab).map((value) => ({
    value,
    label: taskStatusLabel(value),
  }));

  // Read from what the address holds, offered or not, so Reset is there to clear it all.
  const isFilteredNow =
    search !== "" ||
    param("type") !== "all" ||
    param("status") !== "all" ||
    param("overdue") !== "all" ||
    param("period") !== "all";

  const day = (key: string) => (param(key) === "all" ? "" : param(key));
  // One type named is that type; none, or every type, is all of them, as the list reads it.
  const types = offeredPicks(listParam("type"), TYPE_OPTIONS);
  const type = types.length === 1 ? types[0] : "all";
  const statuses = offeredPicks(listParam("status"), statusOptions);
  const periodIgnored = state.tab === PERIOD_FREE_MY_TAB && param("period") !== "all";

  // What the folded phone bar names, in the order of the controls.
  const active = [
    ...(state.tab === "all"
      ? []
      : [{ id: "tab", text: `Tampilkan: ${tabLabel(state.tab)}`, onRemove: () => selectTab("all") }]),
    ...pickFilters("Tipe", type === "all" ? [] : [type], TYPE_OPTIONS, () => setParam("type", "all")),
    ...(statusOptions.length > 1
      ? pickFilters("Status", statuses, statusOptions, (next) => setParam("status", next.join(",")))
      : []),
    ...(state.tab === "done" ? [] : overdueFilter(param("overdue"), () => setParam("overdue", "all"))),
    ...periodFilter(param("period"), day("from"), day("to"), periodIgnored, () =>
      setParams({ period: "all", from: "", to: "" }),
    ),
  ];

  function tabLabel(tab: MyTasksParams["tab"]): string {
    return MY_TASK_TABS.find((def) => def.key === tab)?.label ?? tab;
  }

  return (
    <FilterBar
      search={<SearchBox label="Cari judul konten" value={search} onChange={setSearch} />}
      active={active}
      reset={
        isFilteredNow ? (
          <ResetFilters
            onReset={() =>
              resetKeeping({
                ...(state.tab === "all" ? {} : { tab: state.tab }),
                ...taskViewParams(view),
              })
            }
            disabled={pending}
          />
        ) : null
      }
    >
      <TabChoice tabs={MY_TASK_TABS} counts={counts} active={state.tab} onSelect={selectTab} />

      <FilterRadio
        label="Tipe"
        value={type}
        options={TYPE_CHOICES}
        onChange={(value) => setParam("type", value)}
      />

      {statusOptions.length > 1 ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={statuses}
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
        ignored={periodIgnored}
        onPeriod={setPeriod}
        onChange={setParam}
        onClear={() => setParams({ from: "", to: "" })}
      />
    </FilterBar>
  );
}
