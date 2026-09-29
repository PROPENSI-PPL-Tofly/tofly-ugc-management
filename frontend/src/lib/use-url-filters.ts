"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/** Long enough that a typed word is one request, short enough to feel immediate. */
export const SEARCH_DEBOUNCE_MS = 300;

/** The list APIs refuse a longer search with a 400, so the box stops there. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * A list's filter bar where the URL is the only state: a search box pushed to `?q=` once typing
 * pauses, other filters pushed as they change, and a reset back to the bare path. Any change
 * drops `?page=`, since the old page number no longer points at anything meaningful.
 *
 * The search box is driven locally so typing never waits on a round trip. What was last sent to
 * the URL is remembered, not read back from it: the URL lags behind by a server render, and
 * comparing against it would let a reset (or any change) be undone by a debounce that still
 * saw the old value.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

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

  const replace = useCallback(
    (next: URLSearchParams) => {
      next.delete("page");
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  /** Sets one filter; an empty value or "all" removes it from the URL. */
  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
      replace(next);
    },
    [replace, searchParams],
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

  /** Clears the search box and every filter in one step. */
  const reset = useCallback(() => {
    lastSent.current = "";
    setSearch("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router]);

  /** The current value of a filter, "all" when it is not applied. */
  const param = useCallback((key: string) => searchParams.get(key) ?? "all", [searchParams]);

  return { search, setSearch, param, setParam, reset, pending };
}
