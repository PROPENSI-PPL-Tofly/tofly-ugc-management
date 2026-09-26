"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Place {
  href: string;
  label: string;
  /** Pages reached from this place that should keep it marked as current. */
  covers?: string[];
}

/** A path is inside a place when it is the place itself or a page below it. */
function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The rail menu shared by every role: each role passes its places, so a new page is a new
 * entry in a list rather than another copy of this markup. Client-side only to know which
 * place is on screen.
 */
export function ShellNav({ label, places }: Readonly<{ label: string; places: Place[] }>) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="min-w-0 flex-1">
      {/* On a phone the menu is one row beside the logo; it scrolls sideways within that row
          rather than clipping the last item or widening the page. The padding keeps the focus
          ring, drawn outside each link, inside the scrolling row. */}
      <ul className="flex gap-1 overflow-x-auto p-1 md:flex-col md:overflow-visible md:p-0">
        {places.map((place) => {
          const current = [place.href, ...(place.covers ?? [])].some((href) =>
            isWithin(pathname, href),
          );
          return (
            <li key={place.href} className="shrink-0">
              <Link
                href={place.href}
                aria-current={current ? "page" : undefined}
                className="block truncate rounded-(--radius-control) px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:bg-rule-2 aria-[current=page]:bg-accent-wash aria-[current=page]:text-accent-deep"
              >
                {place.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
