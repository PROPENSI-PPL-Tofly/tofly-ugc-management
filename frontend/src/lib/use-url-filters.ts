"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

/** Long enough that a typed word is one request, short enough to feel immediate. */
export const SEARCH_DEBOUNCE_MS = 300;

/** The list APIs refuse a longer search with a 400, so the box stops there. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * A list's filter bar where the URL is the only lasting state: a search box pushed to `?q=` once
 * typing pauses, other filters pushed as they change, and a reset back to the bare path. Any
 * change drops `?page=`, since the old page number no longer points at anything meaningful.
 *
 * The bar is driven locally so neither typing nor ticking waits on a round trip. What was last
 * sent to the URL is remembered, not read back from it: the URL lags behind by a server render,
 * and building on it would let a second change (or a debounce) undo the one still on its way.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const lastSent = useRef(q);

  // The filters as the bar holds them, ahead of the URL while a change is on its way. `latest`
  // is the same value for a second change made before the first one has re-rendered.
  const urlQuery = searchParams.toString();
  const [held, setHeld] = useState(urlQuery);
  const latest = useRef(urlQuery);
  const seenUrl = useRef(urlQuery);
  /** Every query sent that the URL has not shown yet, oldest first. */
  const onTheirWay = useRef<string[]>([]);

  // Back/forward (or a link) changed the search without any typing: the box follows it.
  useEffect(() => {
    if (q !== lastSent.current) {
      lastSent.current = q;
      setSearch(q);
    }
  }, [q]);

  // The URL moved. One of this bar's own changes landing needs nothing: the bar is already
  // there, or further on if a newer change followed it. Anything else (back, a tab, a link) is
  // somebody else's move, and the bar follows it.
  useEffect(() => {
    if (urlQuery === seenUrl.current) return;
    seenUrl.current = urlQuery;

    const landed = onTheirWay.current.indexOf(urlQuery);
    if (landed >= 0) {
      onTheirWay.current = onTheirWay.current.slice(landed + 1);
      return;
    }

    onTheirWay.current = [];
    latest.current = urlQuery;
    setHeld(urlQuery);
  }, [urlQuery]);

  const send = useCallback(
    (query: string) => {
      latest.current = query;
      onTheirWay.current.push(query);
      setHeld(query);
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  /** Sets one filter; an empty value or "all" removes it from the URL. */
  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(latest.current);
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
      next.delete("page");
      send(next.toString());
    },
    [send],
  );

  // One request per pause in typing rather than one per keystroke.
  useEffect(() => {
    if (search === lastSent.current) return;

    const timer = setTimeout(() => {
      lastSent.current = search;
      setParam("q", search.trim() === "" ? "" : search);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, setParam]);

  /**
   * Clears the search box and every filter in one step, leaving only what the caller names
   * (the tab a page is on, say). The search is marked as sent, so its debounce has nothing
   * left to send and cannot put the old filters back.
   */
  const resetKeeping = useCallback(
    (keep: Readonly<Record<string, string>>) => {
      lastSent.current = "";
      setSearch("");
      send(new URLSearchParams(keep).toString());
    },
    [send],
  );

  /** Clears the search box and every filter in one step. */
  const reset = useCallback(() => resetKeeping({}), [resetKeeping]);

  const filters = useMemo(() => new URLSearchParams(held), [held]);

  /** The current value of a filter, "all" when it is not applied. */
  const param = useCallback((key: string) => filters.get(key) ?? "all", [filters]);

  return { search, setSearch, param, setParam, reset, resetKeeping, pending };
}
