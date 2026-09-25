"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "draft_review", label: "Draft Menunggu Review" },
  { value: "draft_revised", label: "Draft Revised" },
] as const;

export function SubmissionFilters({
  q,
  status,
}: {
  q: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [draft, setDraft] = useState(q);
  const isFiltered = draft !== "" || status !== "all";

  const push = useCallback(
    (next: URLSearchParams) => {
      next.delete("page");
      router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const reset = useCallback(() => {
    setDraft("");
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    if (draft === q) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (draft) next.set("q", draft);
      else next.delete("q");
      push(next);
    }, 300);

    return () => clearTimeout(timer);
  }, [draft, q, params, push]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Cari</span>
        <input
          type="search"
          placeholder="Cari kreator atau konten…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink w-48"
        />
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Status</span>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.value === "all") next.delete("status");
            else next.set("status", e.target.value);
            push(next);
          }}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {isFiltered ? (
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
