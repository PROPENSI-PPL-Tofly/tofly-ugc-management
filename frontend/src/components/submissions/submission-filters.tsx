"use client";

import { MAX_SEARCH_LENGTH, useUrlFilters } from "@/lib/use-url-filters";

const STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "draft_review", label: "Draft Menunggu Review" },
  { value: "draft_revised", label: "Draft Revised" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "evergreen", label: "Evergreen" },
  { value: "specific", label: "Specific" },
] as const;

/**
 * The review queue's filter bar. The server parses the URL and hands the validated values in;
 * the search box and the URL updates come from the shared filter hook, so Reset clears
 * everything the same way the Creator Database does.
 */
export function SubmissionFilters({
  status,
  type,
  overdue,
}: {
  status: string;
  type: string;
  overdue: boolean;
}) {
  const { search, setSearch, setParam, reset, pending } = useUrlFilters();
  const isFiltered = search !== "" || status !== "all" || type !== "all" || overdue;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Cari</span>
        <input
          type="search"
          placeholder="Cari kreator atau konten…"
          aria-label="Cari draft"
          maxLength={MAX_SEARCH_LENGTH}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink w-48"
        />
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Status</span>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Tipe</span>
        <select
          aria-label="Tipe"
          value={type}
          onChange={(e) => setParam("type", e.target.value)}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={overdue}
          onChange={(e) => setParam("overdue", e.target.checked ? "true" : "")}
        />
        <span className="text-muted">Overdue</span>
      </label>

      {isFiltered ? (
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
