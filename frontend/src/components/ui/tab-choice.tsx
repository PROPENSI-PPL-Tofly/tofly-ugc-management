"use client";

import { FilterSelect, type FilterOption } from "@/components/filters/filter-controls";
import type { StatusTabDef } from "./status-tabs";

/**
 * Adapter: a status tab list and its counts, read as the options of one filter choice. Every
 * tab is named with its count, zero included, so a phone sees each tab's size at once.
 */
export function tabChoiceOptions<K extends string>(
  tabs: readonly StatusTabDef<K>[],
  counts: Readonly<Record<K, number>>,
): FilterOption[] {
  return tabs.map((tab) => ({ value: tab.key, label: `${tab.label} (${counts[tab.key]})` }));
}

/**
 * The status tabs as one "Tampilkan" choice inside a phone's folded filters, where the row of
 * tabs steps aside. Picking hands the tab back to the same select the row uses, so both make the
 * very same move. Below sm only; from sm up the row of tabs is the way to switch.
 */
export function TabChoice<K extends string>({
  tabs,
  counts,
  active,
  onSelect,
}: Readonly<{
  tabs: readonly StatusTabDef<K>[];
  counts: Readonly<Record<K, number>>;
  active: K;
  onSelect: (tab: K) => void;
}>) {
  return (
    <div className="contents sm:hidden">
      <FilterSelect
        label="Tampilkan"
        value={active}
        options={tabChoiceOptions(tabs, counts)}
        onChange={(value) => onSelect(value as K)}
      />
    </div>
  );
}
