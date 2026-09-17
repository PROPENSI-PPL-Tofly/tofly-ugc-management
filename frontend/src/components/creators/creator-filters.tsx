"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CreatorFilters as Filters } from "@/lib/creators";
import { updateQuery } from "@/lib/query";

/** Long enough that a word is typed before a request goes out, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

const CONTRACT_OPTIONS = [
  { value: "all", label: "Semua kontrak" },
  { value: "active", label: "Kontrak aktif" },
  { value: "expired", label: "Kontrak berakhir" },
];

const PRODUCTIVITY_OPTIONS = [
  { value: "all", label: "Semua produktivitas" },
  { value: "good", label: "Baik" },
  { value: "watch", label: "Perlu perhatian" },
  { value: "risk", label: "Berisiko" },
];

const CONTROL =
  "h-9 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[13px] text-ink";

export function CreatorFilters({
  filters,
  shown,
  total,
}: {
  filters: Filters;
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(filters.q);

  const navigate = (query: string) => {
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  // The URL holds the filters, so a search has to end up there — but not on every keystroke.
  // Waiting for typing to settle turns "rangga" into one request instead of six.
  useEffect(() => {
    if (term === filters.q) return;

    const timer = setTimeout(() => {
      navigate(updateQuery(searchParams.toString(), { q: term }));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, filters.q]);

  const change = (key: "contract" | "productivity", value: string) => {
    navigate(updateQuery(searchParams.toString(), { [key]: value === "all" ? "" : value }));
  };

  const reset = () => {
    setTerm("");
    navigate("");
  };

  const narrowed = filters.q || filters.contract !== "all" || filters.productivity !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-line bg-surface-low px-5 py-3">
      <label htmlFor="creator-search" className="sr-only">
        Cari nama atau email
      </label>
      <input
        id="creator-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Cari nama atau email"
        className={`${CONTROL} min-w-[240px] flex-1 sm:flex-none`}
      />

      <label htmlFor="creator-contract" className="sr-only">
        Status kontrak
      </label>
      <select
        id="creator-contract"
        value={filters.contract}
        onChange={(event) => change("contract", event.target.value)}
        className={CONTROL}
      >
        {CONTRACT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="creator-productivity" className="sr-only">
        Produktivitas
      </label>
      <select
        id="creator-productivity"
        value={filters.productivity}
        onChange={(event) => change("productivity", event.target.value)}
        className={CONTROL}
      >
        {PRODUCTIVITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {narrowed ? (
        <Button variant="ghost" onClick={reset}>
          Reset filter
        </Button>
      ) : null}

      <span className="ml-auto text-[12.5px] text-muted">
        {shown} dari {total} creator
      </span>
    </div>
  );
}
