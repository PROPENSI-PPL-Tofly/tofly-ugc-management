"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CONTRACT_STATUS_FILTERS, PRODUCTIVITY_FILTERS } from "@/lib/creators";

const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

const RESET =
  "cursor-pointer rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink";

/** Long enough that a typed word is one request, short enough to feel immediate. */
const SEARCH_DEBOUNCE_MS = 300;

const CONTRACT_LABELS: Record<(typeof CONTRACT_STATUS_FILTERS)[number], string> = {
  all: "Semua",
  active: "Aktif",
  expired: "Berakhir",
  upcoming: "Belum mulai",
  none: "Belum ada kontrak",
};

const PRODUCTIVITY_LABELS: Record<(typeof PRODUCTIVITY_FILTERS)[number], string> = {
  all: "Semua",
  good: "Bagus",
  watch: "Perlu perhatian",
  risk: "Risiko",
};

export function CreatorFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const contractStatus = searchParams.get("contractStatus") ?? "all";
  const productivity = searchParams.get("productivity") ?? "all";

  // The input is driven locally so typing never waits on a round trip; the URL catches up
  // once the typing stops. Keyed by the URL value so Back and Reset still reach the box.
  const [draft, setDraft] = useState(q);
  const lastPushed = useRef(q);

  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setDraft(q);
    }
  }, [q]);

  const isFiltered = q !== "" || contractStatus !== "all" || productivity !== "all";

  const push = useCallback(
    (next: URLSearchParams) => {
      // A filter change means the old page number no longer points at anything meaningful.
      next.delete("page");
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
      push(next);
    },
    [push, searchParams],
  );

  // One request per pause in typing rather than one per keystroke, each of which would be a
  // server render plus a backend round trip.
  useEffect(() => {
    if (draft === q) return;

    const timer = setTimeout(() => {
      lastPushed.current = draft;
      setParam("q", draft);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, q, setParam]);

  const reset = useCallback(() => {
    lastPushed.current = "";
    setDraft("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Cari</span>
        <input
          type="search"
          name="q"
          aria-label="Cari creator"
          placeholder="Nama atau email…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
