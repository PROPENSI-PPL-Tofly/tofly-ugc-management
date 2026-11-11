"use client";

import {
  FilterBar,
  FilterRadio,
  FilterSelect,
  OVERDUE_OPTIONS,
  PERIOD_OPTIONS,
  PeriodFilter,
  SearchBox,
  offeredPicks,
  overdueFilter,
  periodFilter,
  pickFilters,
} from "@/components/filters/filter-controls";
import { FilterChips, choiceChip, pickedChips } from "@/components/ui/filter-chips";
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
 * Content Plan. The calendar leaves Periode out: its month is already the period on show. The server hands in the validated tab, so the status choices stay scoped to
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

  // One type named is that type; none, or every type, is all of them, as the list reads it.
  const types = offeredPicks(listParam("type"), TYPE_OPTIONS);
  const type = types.length === 1 ? types[0] : "all";
  const statusPicks = offeredPicks(listParam("status"), statusOptions);
  const periodIgnored = state.tab === PERIOD_FREE_MY_TAB && param("period") !== "all";

  // What the folded phone bar counts, in the order of the controls.
  const active = [
    ...(state.tab === "all"
      ? []
      : [{ id: "tab", text: `Tampilkan: ${tabLabel(state.tab)}` }]),
    ...pickFilters("Tipe", type === "all" ? [] : [type], TYPE_OPTIONS),
    ...(statusOptions.length > 1 ? pickFilters("Status", statusPicks, statusOptions) : []),
    ...(state.tab === "done" ? [] : overdueFilter(param("overdue"))),
    ...(withPeriod ? periodFilter(param("period"), day("from"), day("to"), periodIgnored) : []),
  ];

  function tabLabel(tab: MyTasksParams["tab"]): string {
    return MY_TASK_TABS.find((def) => def.key === tab)?.label ?? tab;
  }

  function resetKeepingTabAndView() {
    resetKeeping({
      ...(state.tab === "all" ? {} : { tab: state.tab }),
      ...taskViewParams(view),
    });
  }

  return (
    <>
      {/* Reset sits with the chips below, so the bar draws none of its own. */}
      <FilterBar
        search={<SearchBox label="Cari judul konten" value={search} onChange={setSearch} />}
        active={active}
        reset={null}
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
            ignored={periodIgnored}
            onPeriod={setPeriod}
            onChange={setParam}
            onClear={() => setParams({ from: "", to: "" })}
          />
        ) : null}
      </FilterBar>

      {/* Every pick named after its filter, gathered below the bar as the benchmark lays them:
          the one-choice filters' too. */}
      <FilterChips
        chips={[
          ...choiceChip("Tipe", type, TYPE_CHOICES, () => setParam("type", "all")),
          ...(statusOptions.length > 1
            ? pickedChips("Status", statusPicks, statusOptions, (value) =>
                setParam(
                  "status",
                  statusPicks.filter((pick) => pick !== value).join(","),
                ),
              )
            : []),
          ...(state.tab === "done"
            ? []
            : choiceChip("Overdue", param("overdue"), OVERDUE_OPTIONS, () => setParam("overdue", "all"))),
          ...(withPeriod
            ? choiceChip("Periode", param("period"), PERIOD_OPTIONS, () => setPeriod("all"))
            : []),
        ]}
        canReset={isFilteredNow}
        resetDisabled={pending}
        onReset={resetKeepingTabAndView}
      />
    </>
  );
}
