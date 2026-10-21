"use client";

import type { FilterOption } from "@/components/filters/filter-controls";
import type { StatusTabDef } from "./status-tabs";

/** Stub until the tabs come to the phone's filters: no options yet. */
export function tabChoiceOptions<K extends string>(
  tabs: readonly StatusTabDef<K>[],
  counts: Readonly<Record<K, number>>,
): FilterOption[] {
  void tabs;
  void counts;
  return [];
}

/** Stub until the tabs come to the phone's filters: draws nothing. */
export function TabChoice<K extends string>(
  props: Readonly<{
    tabs: readonly StatusTabDef<K>[];
    counts: Readonly<Record<K, number>>;
    active: K;
    onSelect: (tab: K) => void;
  }>,
) {
  void props;
  return null;
}
