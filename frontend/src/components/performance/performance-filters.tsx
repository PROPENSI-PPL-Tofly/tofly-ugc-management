"use client";

import { FilterChips, pickedChips } from "@/components/ui/filter-chips";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import type { ContentPlanCreatorOption } from "@/lib/content-plan";
import { DATA_STATE_LABELS, type DataState } from "@/lib/link-performance";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/platform-links";
import { offeredPicks } from "@/components/filters/filter-controls";
import { useUrlFilters } from "@/lib/use-url-filters";

/**
 * The "Performa Konten" filter bar: whose link, which platform (AC 23) and which Status Data.
 * Every control reads the live address through the shared hook, so a pick is one replace away,
 * the page it was on is dropped, and Reset clears the filters at once. The creator filter
 * reuses the creator list's options and is left out when none are given: a creator's own list
 * is only theirs.
 */
export function PerformanceFilters({
  creators,
}: Readonly<{ creators?: readonly ContentPlanCreatorOption[] }>) {
  const { param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

  const creatorOptions: MultiSelectOption[] = (creators ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  // Worded as the state's badge in the table is, in the order the table's tips explain them.
  const stateOptions: MultiSelectOption[] = (
    ["synced", "waiting", "not_connected", "not_found", "sync_failed", "manual"] as DataState[]
  ).map((value) => ({ value, label: DATA_STATE_LABELS[value] }));
  const platformOptions: MultiSelectOption[] = PLATFORMS.map((value) => ({
    value,
    label: PLATFORM_LABELS[value],
  }));

  /**
   * The picked creators as the address holds them. Not narrowed to the loaded names: the
   * roster is capped, so a creator picked beyond it is still a pick.
   */
  function pickedCreators(): string[] {
    const raw = listParam("creator");
    return raw === "all" ? [] : raw.split(",").filter((part) => part !== "");
  }

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  const pickedPlatforms = offeredPicks(listParam("platform"), platformOptions);
  const pickedStates = offeredPicks(listParam("state"), stateOptions);
  const isFilteredNow =
    (creators !== undefined && param("creator") !== "all") ||
    param("platform") !== "all" ||
    param("state") !== "all";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
        {creators ? (
          <MultiSelect
            label="Creator"
            options={creatorOptions}
            selected={pickedCreators()}
            onChange={(next) => setListParam("creator", next)}
          />
        ) : null}

        <MultiSelect
          label="Platform"
          options={platformOptions}
          selected={pickedPlatforms}
          onChange={(next) => setListParam("platform", next)}
        />

        <MultiSelect
          label="Status Data"
          options={stateOptions}
          selected={pickedStates}
          onChange={(next) => setListParam("state", next)}
        />
      </div>

      {/* Every pick named after its filter, gathered below the bar as the benchmark lays them. */}
      <FilterChips
        chips={[
          ...(creators
            ? pickedChips("Creator", pickedCreators(), creatorOptions, (value) =>
                setListParam(
                  "creator",
                  pickedCreators().filter((pick) => pick !== value),
                ),
              )
            : []),
          ...pickedChips("Platform", pickedPlatforms, platformOptions, (value) =>
            setListParam(
              "platform",
              pickedPlatforms.filter((pick) => pick !== value),
            ),
          ),
          ...pickedChips("Status Data", pickedStates, stateOptions, (value) =>
            setListParam(
              "state",
              pickedStates.filter((pick) => pick !== value),
            ),
          ),
        ]}
        canReset={isFilteredNow}
        resetDisabled={pending}
        onReset={() => resetKeeping({})}
      />
    </>
  );
}
