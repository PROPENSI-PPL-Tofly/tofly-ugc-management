"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { latestQuery, useUrlQuery } from "./url-query";

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
 * That record is the page's, kept in url-query and shared with whatever else rewrites the same
 * address (tabs, a sort header), so their changes and the bar's build on each other.
 */
export function useUrlFilters() {
  const { query, replaceQuery, pending } = useUrlQuery();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const lastSent = useRef(q);

  // Back/forward (or a link) changed the search without any typing: the box follows it.
  useEffect(() => {
    if (q !== lastSent.current) {
      lastSent.current = q;
      setSearch(q);
    }
  }, [q]);

  /**
   * Sets several filters in one navigation, for a change that is one step to the person (a
   * period and its days); an empty value or "all" removes that filter from the URL.
   */
  const setParams = useCallback(
    (changes: Readonly<Record<string, string>>) => {
      const next = new URLSearchParams(latestQuery());
      for (const [key, value] of Object.entries(changes)) {
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
      }
      next.delete("page");
      replaceQuery(next.toString());
    },
    [replaceQuery],
  );

  /** Sets one filter; an empty value or "all" removes it from the URL. */
  const setParam = useCallback(
    (key: string, value: string) => setParams({ [key]: value }),
    [setParams],
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
      replaceQuery(new URLSearchParams(keep).toString());
    },
    [replaceQuery],
  );

  /** Clears the search box and every filter in one step. */
  const reset = useCallback(() => resetKeeping({}), [resetKeeping]);

  const filters = useMemo(() => new URLSearchParams(query), [query]);

  /** The current value of a filter, "all" when it is not applied. */
  const param = useCallback((key: string) => filters.get(key) ?? "all", [filters]);

  /**
   * A multi-select's picks, comma-separated as the bar writes them, "all" when none. A link
   * from elsewhere may repeat the parameter instead; the list reads every value, so the bar does.
   */
  const listParam = useCallback(
    (key: string) => filters.getAll(key).join(",") || "all",
    [filters],
  );

  return { search, setSearch, param, listParam, setParam, setParams, reset, resetKeeping, pending };
}
