"use client";

import { CONTRACT_STATUS_FILTERS, PRODUCTIVITY_FILTERS } from "@/lib/creators";
import { MAX_SEARCH_LENGTH, useUrlFilters } from "@/lib/use-url-filters";

const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

const RESET =
  "cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink";

const CONTRACT_LABELS: Record<(typeof CONTRACT_STATUS_FILTERS)[number], string> = {
  all: "Semua",
  active: "Aktif",
  expired: "Berakhir",
  upcoming: "Belum mulai",
};

const PRODUCTIVITY_LABELS: Record<(typeof PRODUCTIVITY_FILTERS)[number], string> = {
  all: "Semua",
  good: "Baik",
  watch: "Perlu Perhatian",
  risk: "Berisiko",
  no_data: "Belum Ada Data",
};

export function CreatorFilters() {
  const { search, setSearch, param, setParam, reset, pending } = useUrlFilters();
  const contractStatus = param("contractStatus");
  const productivity = param("productivity");
  const isFiltered = search !== "" || contractStatus !== "all" || productivity !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Cari</span>
        <input
          type="search"
          name="q"
          aria-label="Cari creator"
          placeholder="Nama atau email…"
          maxLength={MAX_SEARCH_LENGTH}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${FIELD} w-48`}
        />
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Status kontrak</span>
        <select
          name="contractStatus"
          aria-label="Status kontrak"
          value={contractStatus}
          onChange={(event) => setParam("contractStatus", event.target.value)}
          className={FIELD}
        >
          {CONTRACT_STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {CONTRACT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Produktivitas</span>
        <select
          name="productivity"
          aria-label="Produktivitas"
          value={productivity}
          onChange={(event) => setParam("productivity", event.target.value)}
          className={FIELD}
        >
          {PRODUCTIVITY_FILTERS.map((value) => (
            <option key={value} value={value}>
              {PRODUCTIVITY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      {isFiltered ? (
        <button type="button" onClick={reset} disabled={pending} className={RESET}>
          Reset
        </button>
      ) : null}
    </div>
  );
}
