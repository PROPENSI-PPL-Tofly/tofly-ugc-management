"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore, useTransition } from "react";

// One page, one query string, several controls that rewrite it: a filter bar, tabs, a sort
// header. The address bar only changes once the server has rendered, so a control that builds
// its change on what the address bar shows drops whatever another control sent a moment ago.
// This module is the one record of what was last sent. Every control reads it and writes
// through it, so each change builds on the one before, whoever made it.
//
// It is module state on purpose: the controls are siblings rendered by a server page, with no
// client parent to hold it. It is only ever written from effects and event handlers, which do
// not run on the server, so nothing is shared between requests.

interface Flight {
  /** The page these belong to; another page starts clean. */
  path: string | null;
  /** The query string the address bar last showed. */
  url: string;
  /** What the controls hold while it is ahead of the address bar; null once the two agree. */
  held: string | null;
  /** Every query sent that the address bar has not shown yet, oldest first. */
  onTheirWay: string[];
}

const flight: Flight = { path: null, url: "", held: null, onTheirWay: [] };
const listeners = new Set<() => void>();

function hold(next: string | null) {
  if (flight.held === next) return;

  flight.held = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    // Nobody is left on the page: what was on its way belongs to a page that is gone.
    if (listeners.size === 0) {
      flight.path = null;
      flight.url = "";
      flight.held = null;
      flight.onTheirWay = [];
    }
  };
}

function heldNow() {
  return flight.held;
}

/**
 * The query string as of the last change sent, which is what the next change has to build on.
 * For event handlers: it is ahead of the address bar while a change is on its way.
 */
export function latestQuery(): string {
  return flight.held ?? flight.url;
}

/**
 * The page's query string for a control that rewrites it. `query` is what the controls hold,
 * shown at once and ahead of the address bar while a change is on its way; `replaceQuery`
 * sends a new one, which every other control on the page sees and builds on, and
 * `replaceQuietly` writes one the server has nothing to render for.
 */
export function useUrlQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = useSearchParams().toString();
  const [pending, startTransition] = useTransition();
  const held = useSyncExternalStore(subscribe, heldNow, heldNow);

  // The address bar moved. This page's newest change landing settles everything, and the
  // controls follow the address bar again. An older change of its own landing late needs
  // nothing: the controls are already further on. Anything else (back, a pagination link, a
  // panel opening) is somebody else's move, and the controls follow it.
  useEffect(() => {
    const samePage = flight.path === pathname;
    if (samePage && flight.url === urlQuery) return;

    flight.path = pathname;
    flight.url = urlQuery;

    if (samePage && urlQuery !== flight.held) {
      const landed = flight.onTheirWay.lastIndexOf(urlQuery);
      if (landed >= 0) {
        flight.onTheirWay = flight.onTheirWay.slice(landed + 1);
        return;
      }
    }

    flight.onTheirWay = [];
    hold(null);
  }, [pathname, urlQuery]);

  const replaceQuery = useCallback(
    (query: string) => {
      // A change back to what the address bar already shows will never be seen to land, so
      // it leaves nothing on its way; the navigation still goes out, to overtake an older one.
      const ahead = query !== flight.url;
      flight.onTheirWay = ahead ? [...flight.onTheirWay, query] : [];
      hold(ahead ? query : null);

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  /**
   * Writes a query into the address with no navigation, for a change the server has nothing
   * to render for (which content's panel is open). While another change is on its way it goes
   * out as a navigation instead: a write straight into the address makes the router drop the
   * navigation it overtakes, and the change that was on its way would be lost.
   */
  const replaceQuietly = useCallback(
    (query: string) => {
      if (flight.held !== null) {
        replaceQuery(query);
        return;
      }

      // The address shows it from this line on, so its arrival is not somebody else's move.
      flight.url = query;
      const search = query ? `?${query}` : "";
      window.history.replaceState(null, "", `${pathname}${search}${window.location.hash}`);
    },
    [pathname, replaceQuery],
  );

  return { query: held ?? urlQuery, replaceQuery, replaceQuietly, pending };
}
