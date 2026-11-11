"use client";

import { FilterChips, pickedChips } from "@/components/ui/filter-chips";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import type { ContentPlanCreatorOption } from "@/lib/content-plan";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/platform-links";
import { offeredPicks, SearchBox } from "@/components/filters/filter-controls";
import { useUrlFilters } from "@/lib/use-url-filters";

/**
 * The "Performa Konten" filter bar: a search over content and creator names (I3.2), then whose
 * link and which platform (AC 23). Every control reads the live address through the shared
 * hook, so a pick is one replace away, the page it was on is dropped, and Reset clears the search
 * and both filters at once. The creator filter reuses the creator list's options.
 */
export function PerformanceFilters({
  creators,
}: Readonly<{ creators: readonly ContentPlanCreatorOption[] }>) {
  const { search, setSearch, param, listParam, setParam, resetKeeping, pending } = useUrlFilters();

  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({
    value: c.id,
    label: c.name,
  }));
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
  const isFilteredNow =
    search !== "" || param("creator") !== "all" || param("platform") !== "all";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
        {/* Worded as Content Plan's, the other list of contents by creator. */}
        <SearchBox label="Cari konten atau creator" value={search} onChange={setSearch} />
        <MultiSelect
          label="Creator"
          options={creatorOptions}
          selected={pickedCreators()}
          onChange={(next) => setListParam("creator", next)}
        />

        <MultiSelect
          label="Platform"
          options={platformOptions}
          selected={pickedPlatforms}
          onChange={(next) => setListParam("platform", next)}
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
          ...pickedChips("Platform", pickedPlatforms, platformOptions, (value) =>
            setListParam(
              "platform",
              pickedPlatforms.filter((pick) => pick !== value),
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
