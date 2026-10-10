"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CONTENT_STATUS_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  CONTENT_PLAN_BASE,
  statusOptionsFor,
  type ContentPlanCreatorOption,
  type ContentPlanParams,
} from "@/lib/content-plan";
import { MAX_SEARCH_LENGTH, useUrlFilters } from "@/lib/use-url-filters";

const OVERDUE_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "yes", label: "Overdue" },
  { value: "no", label: "Tidak overdue" },
] as const;

const PERIOD_OPTIONS = [
  { value: "all", label: "Semua periode" },
  { value: "month", label: "Bulan ini" },
  { value: "next30", label: "30 hari ke depan" },
  { value: "last90", label: "90 hari terakhir" },
  { value: "custom", label: "Pilih tanggal…" },
] as const;

const SELECT =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink";

/**
 * The Content Plan's filter bar. The server hands in the validated tab so the status choices
 * can stay scoped to it; every other control reads the live URL through the shared hook, so a
 * pick is one replace away and Reset keeps the tab it was pressed on.
 */
export function ContentPlanFilters({
  state,
  creators,
}: Readonly<{ state: ContentPlanParams; creators: readonly ContentPlanCreatorOption[] }>) {
  const { search, setSearch, param, setParam, pending } = useUrlFilters();
  const router = useRouter();
  const pathname = usePathname();

  const statusChoices = statusOptionsFor(state.tab);
  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({ value: c.id, label: c.name }));
  const typeOptions: MultiSelectOption[] = (Object.keys(CONTENT_TYPE_LABELS) as Array<keyof typeof CONTENT_TYPE_LABELS>).map(
    (value) => ({ value, label: CONTENT_TYPE_LABELS[value] }),
  );
  const statusOptions: MultiSelectOption[] = statusChoices.map((value) => ({
    value,
    label: CONTENT_STATUS_LABELS[value],
  }));

  /** A multi-select parameter as the array the chips hold, empty when it is not applied. */
  function listParam(key: string): string[] {
    const raw = param(key);
    return raw === "all" ? [] : raw.split(",").filter((part) => part !== "");
  }

  function setListParam(key: string, values: string[]) {
    setParam(key, values.join(","));
  }

  /** Clears the box and every filter, but the tab the admin is standing on survives. */
  function resetKeepingTab() {
    setSearch("");
    const next = new URLSearchParams();
    if (state.tab !== "all") next.set("tab", state.tab);
    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const isFilteredNow =
    search !== "" ||
    listParam("creator").length > 0 ||
    listParam("type").length > 0 ||
    listParam("status").length > 0 ||
    param("overdue") !== "all" ||
    param("period") !== "all";

  const from = param("from") === "all" ? "" : param("from");
  const to = param("to") === "all" ? "" : param("to");

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <input
        type="search"
        placeholder="Cari konten atau creator…"
        aria-label="Cari konten atau creator"
        maxLength={MAX_SEARCH_LENGTH}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${SELECT} w-52`}
      />

      <MultiSelect
        label="Creator"
        options={creatorOptions}
        selected={listParam("creator")}
        onChange={(next) => setListParam("creator", next)}
      />

      <MultiSelect
        label="Tipe"
        options={typeOptions}
        selected={listParam("type")}
        onChange={(next) => setListParam("type", next)}
      />

      {statusOptions.length > 1 ? (
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={listParam("status")}
          onChange={(next) => setListParam("status", next)}
        />
      ) : null}

      {state.tab !== "done" ? (
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted">Overdue</span>
          <select
            aria-label="Overdue"
            value={param("overdue")}
            onChange={(e) => setParam("overdue", e.target.value)}
            className={SELECT}
          >
            {OVERDUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Periode</span>
        <select
          aria-label="Periode"
          value={param("period")}
          onChange={(e) => setParam("period", e.target.value)}
          className={SELECT}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {param("period") === "custom" ? (
        <>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">Dari</span>
            <input
              type="date"
              aria-label="Dari"
              value={from}
              onChange={(e) => setParam("from", e.target.value)}
              className={SELECT}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">Sampai</span>
            <input
              type="date"
              aria-label="Sampai"
              value={to}
              onChange={(e) => setParam("to", e.target.value)}
              className={SELECT}
            />
          </label>
        </>
      ) : null}

      {state.tab === "action" && state.period !== "all" ? (
        <span className="text-xs font-semibold text-amber">Periode tidak berlaku di tab ini</span>
      ) : null}

      {isFilteredNow ? (
        <button
          type="button"
          onClick={resetKeepingTab}
          disabled={pending}
          className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
