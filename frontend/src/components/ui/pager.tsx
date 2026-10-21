"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { pageOf } from "@/lib/pager";

/** What the pager control is told: where the page sits in the list, and how to turn it. */
export interface PagerProps {
  /** The navigation's accessible name. */
  label: string;
  /** What a row is, for the arrows' names ("Task overdue berikutnya"). */
  noun: string;
  page: number;
  pages: number;
  first: number;
  last: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

// A 44px square a thumb can hit at every width; pressed, it darkens and shrinks a little.
const ARROW =
  "grid size-11 cursor-pointer place-items-center rounded-(--radius-control) border-[1.5px] border-rule bg-surface text-lg font-extrabold text-ink transition-[background-color,scale] hover:bg-surface-2 active:scale-[.94] motion-reduce:active:scale-100 active:bg-rule-2 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100";

/**
 * Presentational: where a page sits in its list ("2 dari 4", or "1–3 dari 5" when a page holds
 * more than one row), one mark per page with the current one drawn apart, and an arrow either
 * side that stops at its end. It keeps no state; whoever holds the page turns it. Nothing is
 * drawn while the list fits on one page.
 */
export function Pager({ label, noun, page, pages, first, last, total, onPrev, onNext }: Readonly<PagerProps>) {
  if (pages <= 1) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2 border-t border-rule-2 px-2.5 py-2">
      <button type="button" aria-label={`${noun} sebelumnya`} disabled={page === 0} onClick={onPrev} className={ARROW}>
        ‹
      </button>
      <div className="flex flex-col items-center gap-1.5">
        <span aria-live="polite" className="text-[13px] font-bold tabular-nums text-ink-2">
          {first === last ? `${first} dari ${total}` : `${first}–${last} dari ${total}`}
        </span>
        <span aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: pages }, (_, index) => (
            <i
              key={index}
              data-testid="pager-mark"
              data-current={index === page ? "true" : undefined}
              className={`block h-[7px] rounded-full ${index === page ? "w-[18px] bg-ink-2" : "w-[7px] bg-rule"}`}
            />
          ))}
        </span>
      </div>
      <button type="button" aria-label={`${noun} berikutnya`} disabled={page === pages - 1} onClick={onNext} className={ARROW}>
        ›
      </button>
    </nav>
  );
}

/** From sm up a page holds the wide count; below it, the phone count. */
const WIDE = "(min-width: 640px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(WIDE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isWide(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches;
}

/**
 * How many rows a page holds on this screen: `phone` below sm, `wide` from sm up, following the
 * screen as it turns. The server has no screen to ask and renders the phone size.
 */
export function usePageSize(phone: number, wide: number): number {
  const wideNow = useSyncExternalStore(subscribe, isWide, () => false);
  return wideNow ? wide : phone;
}

/**
 * Container: holds which page is shown and slices the rows it is handed (rendered already, so a
 * server component can page its own markup); the Pager below draws where it is and turns it.
 */
export function PagedList({
  label,
  noun,
  phone,
  wide,
  children,
}: Readonly<{ label: string; noun: string; phone: number; wide: number; children: ReactNode[] }>) {
  const size = usePageSize(phone, wide);
  const [page, setPage] = useState(0);
  const view = pageOf(children, page, size);

  return (
    <>
      <ul>{view.rows}</ul>
      <Pager
        label={label}
        noun={noun}
        page={view.page}
        pages={view.pages}
        first={view.first}
        last={view.last}
        total={view.total}
        onPrev={() => setPage(view.page - 1)}
        onNext={() => setPage(view.page + 1)}
      />
    </>
  );
}
