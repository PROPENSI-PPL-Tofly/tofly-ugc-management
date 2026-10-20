"use client";

import { useRef, type KeyboardEvent } from "react";
import { SCROLL_HINT, useScrollHint } from "./use-scroll-hint";

const TAB_BASE =
  "shrink-0 cursor-pointer whitespace-nowrap rounded-t-(--radius-control) border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors";

// Each state names its own border and colour: stacked on one another, two utilities of the same
// property resolve by stylesheet order, and the plain tab's won.
const TAB = `${TAB_BASE} border-transparent text-muted hover:text-ink`;
const TAB_ON = `${TAB_BASE} border-accent text-accent-deep`;

const COUNT_RED = "ml-2 rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-accent-ink";
const COUNT_GREY =
  "ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2";

/** One tab of a status tab list. */
export interface StatusTabDef<K extends string> {
  key: K;
  label: string;
  /** The tab holds what still needs doing, so its counter turns red past zero and hides at zero. */
  urgent: boolean;
  /** The tab always shows its count, zero included. */
  counter: boolean;
}

/**
 * A list's tabs grouped by whose turn it is, shared by the admin Content Plan and Task Saya.
 * Only the urgent counter turns red, and only past zero — a red badge on an empty queue would
 * cry wolf; the number itself carries the meaning, so colour is never the only signal.
 *
 * Keyboard as the WAI-ARIA tab pattern expects: the list is one Tab stop (the selected tab),
 * the arrows move between tabs with wrap-around, Home and End jump to either end. Moving
 * selects, since each tab is a different list and there is nothing to preview.
 */
export function StatusTabs<K extends string>({
  label,
  panelId,
  tabs,
  active,
  counts,
  onSelect,
}: Readonly<{
  /** The tab list's accessible name. */
  label: string;
  /** The id of the region the tabs switch, so a screen reader can jump to it. */
  panelId: string;
  tabs: readonly StatusTabDef<K>[];
  active: K;
  counts: Readonly<Record<K, number>>;
  onSelect: (tab: K) => void;
}>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // On a phone the row scrolls sideways: its edge fades where more tabs sit off-screen, and
  // the selected tab is kept fully in view.
  const list = useScrollHint<HTMLDivElement>(active);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const targets: Partial<Record<string, number>> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;

    event.preventDefault();
    buttons.current[target]?.focus();
    onSelect(tabs[target].key);
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      className={`flex gap-1 overflow-x-auto border-b border-rule px-5 ${SCROLL_HINT}`}
    >
      {tabs.map((def, index) => {
        const count = counts[def.key];
        const selected = active === def.key;
        // The urgent tab shows its count only when there is one; a counting tab always does.
        const showCount = def.urgent ? count > 0 : def.counter;

        return (
          <button
            key={def.key}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(def.key)}
            onKeyDown={(event) => move(event, index)}
            className={selected ? TAB_ON : TAB}
          >
            {def.label}
            {showCount ? (
              <span
                data-testid={`count-${def.key}`}
                className={def.urgent ? COUNT_RED : COUNT_GREY}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
