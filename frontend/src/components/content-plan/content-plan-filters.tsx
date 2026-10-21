"use client";

import {
  FilterBar,
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
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  CONTENT_PLAN_TABS,
  statusOptionsFor,
  tabDef,
  type ContentPlanCounts,
  type ContentPlanCreatorOption,
  type ContentPlanParams,
} from "@/lib/content-plan";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useContentPlanTabSelect } from "./content-plan-tab-bar";

/**
 * The Content Plan's filter bar. The server hands in the validated tab so the status choices
 * can stay scoped to it; every other control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on. On a phone the tabs are
 * folded in too, as the Tampilkan choice, switched exactly as the row switches them.
 */
export function ContentPlanFilters({
  state,
  creators,
  counts,
}: Readonly<{
  state: ContentPlanParams;
  creators: readonly ContentPlanCreatorOption[];
  /** Each tab's size, named in the phone's Tampilkan choice. */
  counts: ContentPlanCounts;
}>) {
  const { search, setSearch, param, listParam, setParam, setParams, setPeriod, resetKeeping, pending } =
    useUrlFilters();
  const selectTab = useContentPlanTabSelect();

  const statusChoices = statusOptionsFor(state.tab);
  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({ value: c.id, label: c.name }));
  const typeOptions: MultiSelectOption[] = (Object.keys(CONTENT_TYPE_LABELS) as Array<keyof typeof CONTENT_TYPE_LABELS>).map(
    (value) => ({ value, label: CONTENT_TYPE_LABELS[value] }),
  );
  const statusOptions: MultiSelectOption[] = statusChoices.map((value) => ({
    value,
    label: CONTENT_STATUS_LABELS[value],
  }));

  /**
   * The picked creators as the address holds them. Not narrowed to the loaded names: the roster
   * is capped, so a creator picked beyond it is still a pick.
   */
  function pickedCreators(): string[] {
    const raw = listParam("creator");
    return raw === "all" ? [] : raw.split(",").filter((part) => part !== "");
  }

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  /** Clears the box and every filter, but the tab the admin is standing on survives. */
  function resetKeepingTab() {
    resetKeeping(state.tab === "all" ? {} : { tab: state.tab });
  }

  // Read from what the address holds, offered or not, so Reset is there to clear it all.
  const isFilteredNow =
    search !== "" ||
    param("creator") !== "all" ||
    param("type") !== "all" ||
    param("status") !== "all" ||
    param("overdue") !== "all" ||
    param("period") !== "all";

  const from = param("from") === "all" ? "" : param("from");
  const to = param("to") === "all" ? "" : param("to");
  const creatorPicks = pickedCreators();
  const types = offeredPicks(listParam("type"), typeOptions);
  const statuses = offeredPicks(listParam("status"), statusOptions);
  const periodIgnored = state.tab === "action" && param("period") !== "all";

  // What the folded phone bar names, in the order of the controls.
  const active = [
    ...(state.tab === "all"
      ? []
      : [{ id: "tab", text: `Tampilkan: ${tabDef(state.tab).label}`, onRemove: () => selectTab("all") }]),
    ...pickFilters("Creator", creatorPicks, creatorOptions, (next) => setListParam("creator", next)),
    ...pickFilters("Tipe", types, typeOptions, (next) => setListParam("type", next)),
    ...(statusOptions.length > 1
      ? pickFilters("Status", statuses, statusOptions, (next) => setListParam("status", next))
      : []),
    ...(state.tab === "done" ? [] : overdueFilter(param("overdue"), () => setParam("overdue", "all"))),
    ...periodFilter(param("period"), from, to, periodIgnored, () =>
      setParams({ period: "all", from: "", to: "" }),
    ),
  ];

  return (
    <FilterBar
      search={<SearchBox label="Cari konten atau creator" value={search} onChange={setSearch} />}
      active={active}
      reset={isFilteredNow ? <ResetFilters onReset={resetKeepingTab} disabled={pending} /> : null}
    >
      <TabChoice tabs={CONTENT_PLAN_TABS} counts={counts} active={state.tab} onSelect={selectTab} />

      <MultiSelect
        label="Creator"
        options={creatorOptions}
        selected={creatorPicks}
        onChange={(next) => setListParam("creator", next)}
      />

      <MultiSelect
        label="Tipe"
        options={typeOptions}
        selected={types}
        onChange={(next) => setListParam("type", next)}
      />

      {statusOptions.length > 1 ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={statuses}
          onChange={(next) => setListParam("status", next)}
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

      {/* The period from the bar's own state, like the select beside it, so the two agree. */}
      <PeriodFilter
        period={param("period")}
        from={from}
        to={to}
        ignored={periodIgnored}
        onPeriod={setPeriod}
        onChange={setParam}
        onClear={() => setParams({ from: "", to: "" })}
      />
    </FilterBar>
  );
}
