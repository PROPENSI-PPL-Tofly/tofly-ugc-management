"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CreatorFilters as Filters } from "@/lib/creators";
import { updateQuery } from "@/lib/query";

/** Long enough that a word is typed before a request goes out, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

const CONTRACT_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Kontrak Active" },
  { value: "expired", label: "Kontrak Expired" },
];

const PRODUCTIVITY_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "good", label: "Baik" },
  { value: "watch", label: "Perlu Perhatian" },
  { value: "risk", label: "Berisiko" },
];

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

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-line bg-[#FAFAF8] px-[18px] py-3.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="creator-search" className="text-[10.5px] font-semibold uppercase text-muted">
          Cari nama / email
        </label>
        <input
          id="creator-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="cari creator..."
          className="min-w-[200px] rounded-[6px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="creator-contract" className="text-[10.5px] font-semibold uppercase text-muted">
          Status Kontrak
        </label>
        <select
          id="creator-contract"
          value={filters.contract}
          onChange={(event) => change("contract", event.target.value)}
          className="min-w-[150px] rounded-[6px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
        >
          {CONTRACT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="creator-productivity"
          className="text-[10.5px] font-semibold uppercase text-muted"
        >
          Produktivitas
        </label>
        <select
          id="creator-productivity"
          value={filters.productivity}
          onChange={(event) => change("productivity", event.target.value)}
          className="min-w-[150px] rounded-[6px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
        >
          {PRODUCTIVITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Button variant="ghost" onClick={reset}>
        Reset
      </Button>

      <span className="ml-auto text-[11.5px] text-muted">
        {shown} dari {total} creator
      </span>
    </div>
  );
}
