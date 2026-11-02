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
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  statusOptionsFor,
  type ContentPlanCreatorOption,
  type ContentPlanParams,
} from "@/lib/content-plan";
import { useUrlFilters } from "@/lib/use-url-filters";

/**
 * The Content Plan's filter bar. The server hands in the validated tab so the status choices
 * can stay scoped to it; every other control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on.
 */
export function ContentPlanFilters({
  state,
  creators,
}: Readonly<{ state: ContentPlanParams; creators: readonly ContentPlanCreatorOption[] }>) {
  const { search, setSearch, param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
        <SearchBox label="Cari konten atau creator" value={search} onChange={setSearch} />

        <MultiSelect
          label="Creator"
          options={creatorOptions}
          selected={pickedCreators()}
          onChange={(next) => setListParam("creator", next)}
        />

        <MultiSelect
          label="Tipe"
          options={typeOptions}
          selected={offeredPicks(listParam("type"), typeOptions)}
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
          ignored={state.tab === "action" && param("period") !== "all"}
          onChange={setParam}
        />
      </div>

      {/* Every pick named after its filter, gathered below the bar as the benchmark lays them. */}
      <FilterChips
        chips={[
          ...pickedChips("Creator", pickedCreators(), creatorOptions, (value) =>
            setListParam(
              "creator",
              pickedCreators().filter((pick) => pick !== value),
            ),
          ),
          ...pickedChips(
            "Tipe",
            offeredPicks(listParam("type"), typeOptions),
            typeOptions,
            (value) =>
              setListParam(
                "type",
                offeredPicks(listParam("type"), typeOptions).filter((pick) => pick !== value),
              ),
          ),
          ...(statusOptions.length > 1
            ? pickedChips(
                "Status",
                offeredPicks(listParam("status"), statusOptions),
                statusOptions,
                (value) =>
                  setListParam(
                    "status",
                    offeredPicks(listParam("status"), statusOptions).filter(
                      (pick) => pick !== value,
                    ),
                  ),
              )
            : []),
        ]}
        canReset={isFilteredNow}
        resetDisabled={pending}
        onReset={resetKeepingTab}
      />
    </>
  );
}
