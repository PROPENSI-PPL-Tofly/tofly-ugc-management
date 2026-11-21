"use client";

import {
  FILTER_FIELD,
  FilterBar,
  pickFilters,
  type ActiveFilter,
  type FilterOption,
} from "@/components/filters/filter-controls";
import { FilterChips, pickedChips, type FilterChip } from "@/components/ui/filter-chips";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  actionsInCategories,
  auditActionLabel,
  keepActionsInCategories,
  parseAuditLogParams,
  type AuditCategory,
} from "@/lib/audit-log";
import { formatDate } from "@/lib/format";
import { useUrlFilters } from "@/lib/use-url-filters";

const CATEGORY_OPTIONS: FilterOption[] = AUDIT_CATEGORIES.map((category) => ({
  value: category,
  label: AUDIT_CATEGORY_LABELS[category],
}));

function DayFilter({
  label,
  value,
  min,
  max,
  onChange,
}: Readonly<{
  label: "Dari" | "Sampai";
  value: string;
  min?: string;
  max: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="flex items-center gap-2 text-[13px] max-sm:flex-col max-sm:items-stretch">
      <span className="text-muted">{label}:</span>
      <input
        type="date"
        aria-label={`${label} tanggal`}
        value={value}
        min={min || undefined}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className={FILTER_FIELD}
      />
    </label>
  );
}

// The filter bar of "Log Aktivitas" (PBI-23, 23.7). The address is the only lasting state, read
// through parseAuditLogParams, so the bar and the list always agree on what counts as a filter.
export function AuditLogFilters({
  actors,
  creators,
  today,
}: Readonly<{
  actors: readonly FilterOption[];
  creators: readonly FilterOption[];
  // Jakarta's calendar day: no entry can be dated later.
  today: string;
}>) {
  const { param, listParam, setParam, setParams, reset, pending } = useUrlFilters();
  const applied = (value: string) => (value === "all" ? undefined : value);
  const state = parseAuditLogParams({
    from: applied(param("from")),
    to: applied(param("to")),
    actor: applied(listParam("actor")),
    category: applied(listParam("category")),
    action: applied(listParam("action")),
    creator: applied(listParam("creator")),
  });

  const actionOptions: FilterOption[] = actionsInCategories(state.category).map((action) => ({
    value: action,
    label: auditActionLabel(action),
  }));

  // One navigation, so no address with a hidden action on it is ever opened.
  function setCategories(next: readonly string[]) {
    const category = next as readonly AuditCategory[];
    setParams({
      category: category.join(","),
      action: keepActionsInCategories(state.action, category).join(","),
    });
  }

  const without = (picks: readonly string[], value: string) =>
    picks.filter((pick) => pick !== value).join(",");

  const dayChips: FilterChip[] = [
    ...(state.from
      ? [{ id: "from", filterLabel: "Dari", valueLabel: formatDate(state.from), onRemove: () => setParam("from", "") }]
      : []),
    ...(state.to
      ? [{ id: "to", filterLabel: "Sampai", valueLabel: formatDate(state.to), onRemove: () => setParam("to", "") }]
      : []),
  ];
  const chips: FilterChip[] = [
    ...dayChips,
    ...pickedChips("Aktor", state.actor, actors, (value) => setParam("actor", without(state.actor, value))),
    ...pickedChips("Kategori", state.category, CATEGORY_OPTIONS, (value) =>
      setCategories(state.category.filter((pick) => pick !== value)),
    ),
    ...pickedChips("Aksi", state.action, actionOptions, (value) => setParam("action", without(state.action, value))),
    ...pickedChips("Creator", state.creator, creators, (value) =>
      setParam("creator", without(state.creator, value)),
    ),
  ];
  const active: ActiveFilter[] = [
    ...dayChips.map(({ id, filterLabel, valueLabel }) => ({ id, text: `${filterLabel}: ${valueLabel}` })),
    ...pickFilters("Aktor", state.actor, actors),
    ...pickFilters("Kategori", state.category, CATEGORY_OPTIONS),
    ...pickFilters("Aksi", state.action, actionOptions),
    ...pickFilters("Creator", state.creator, creators),
  ];

  return (
    <>
      <FilterBar search={null} active={active} reset={null}>
        <DayFilter
          label="Dari"
          value={state.from}
          max={state.to || today}
          onChange={(value) => setParam("from", value)}
        />
        <DayFilter
          label="Sampai"
          value={state.to}
          min={state.from}
          max={today}
          onChange={(value) => setParam("to", value)}
        />
        <MultiSelect
          label="Aktor"
          options={actors}
          selected={state.actor}
          onChange={(next) => setParam("actor", next.join(","))}
        />
        <MultiSelect label="Kategori" options={CATEGORY_OPTIONS} selected={state.category} onChange={setCategories} />
        <MultiSelect
          label="Aksi"
          options={actionOptions}
          selected={state.action}
          onChange={(next) => setParam("action", next.join(","))}
        />
        <MultiSelect
          label="Creator"
          options={creators}
          selected={state.creator}
          onChange={(next) => setParam("creator", next.join(","))}
        />
      </FilterBar>

      <FilterChips chips={chips} canReset={chips.length > 0} resetDisabled={pending} onReset={reset} />
    </>
  );
}
