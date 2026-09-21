"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

const FIELD =
  "rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-ink";

const RESET =
  "cursor-pointer rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-low hover:text-ink";

export function CreatorFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const contract = searchParams.get("contract") ?? "all";
  const productivity = searchParams.get("productivity") ?? "all";

  const hasActiveFilters = q !== "" || contract !== "all" || productivity !== "all";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const reset = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [router, pathname, startTransition]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Cari</span>
        <input
          type="search"
          role="searchbox"
          aria-label="Cari creator"
          placeholder="Nama atau email…"
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
          className={`${FIELD} w-48`}
        />
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Status kontrak</span>
        <select
          role="combobox"
          aria-label="Status kontrak"
          value={contract}
          onChange={(e) => updateParam("contract", e.target.value)}
          className={FIELD}
        >
          <option value="all">Semua</option>
          <option value="active">Aktif</option>
          <option value="expired">Berakhir</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Produktivitas</span>
        <select
          role="combobox"
          aria-label="Produktivitas"
          value={productivity}
          onChange={(e) => updateParam("productivity", e.target.value)}
          className={FIELD}
        >
          <option value="all">Semua</option>
          <option value="good">Bagus</option>
          <option value="watch">Perlu Perhatian</option>
          <option value="risk">Risiko</option>
        </select>
      </label>

      {hasActiveFilters ? (
        <button type="button" onClick={reset} disabled={pending} className={RESET}>
          Reset
        </button>
      ) : null}
    </div>
  );
}
