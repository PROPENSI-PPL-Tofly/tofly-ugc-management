"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";

/** One tab of an invoice view, by its key and what its button reads. */
export interface InvoiceTabDef<K extends string> {
  key: K;
  label: ReactNode;
}

/**
 * The tab a key moves to, as the WAI-ARIA tab pattern (and StatusTabs) has it: the arrows step
 * with wrap-around, Home and End jump to either end; any other key moves nowhere.
 */
function tabFor<K extends string>(key: string, from: K, order: readonly K[]): K | null {
  const index = order.indexOf(from);
  const last = order.length - 1;
  const targets: Partial<Record<string, number>> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = targets[key];
  return target === undefined ? null : order[target];
}

/**
 * An invoice's tabs (Rincian, Aktivitas & Komentar) and the panel they switch, shared by the
 * creator's Pembayaran page and the admin's Rincian panel so both read and move alike: one Tab
 * stop for the list, brand blue for the open tab, arrows and Home/End between them. Which tab is
 * open is the caller's; this draws the list and reports the choice.
 */
export function InvoiceTabs<K extends string>({
  tabs,
  active,
  onSelect,
  children,
}: Readonly<{
  tabs: readonly InvoiceTabDef<K>[];
  active: K;
  onSelect: (tab: K) => void;
  /** The open tab's content. */
  children: ReactNode;
}>) {
  const tabsId = useId();
  const panelId = useId();
  const order = tabs.map((tab) => tab.key);

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const next = tabFor(event.key, active, order);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Bagian invoice" className="mt-3.5 mb-1.5 flex gap-1 border-b border-rule">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`${tabsId}-${tab.key}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.key)}
              onKeyDown={move}
              className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[12.5px] font-semibold ${selected ? "border-accent text-accent-deep" : "border-transparent text-muted hover:text-ink"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={`${tabsId}-${active}`}>
        {children}
      </div>
    </>
  );
}
