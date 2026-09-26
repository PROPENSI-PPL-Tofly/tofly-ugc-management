"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Place {
  href: string;
  label: string;
  /** Pages reached from this place that should keep it marked as current. */
  covers?: string[];
}

const PLACES: Place[] = [
  { href: "/admin/creators", label: "Creator Database" },
  // The draft queue is opened from Content Plan (All), so it stays under that tab.
  { href: "/admin/content-plan", label: "Content Plan (All)", covers: ["/admin/submissions"] },
];

/** A path is inside a place when it is the place itself or a page below it. */
function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The places an admin can go. Client-side only to know which one is on screen. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu admin" className="min-w-0 flex-1">
      {/* On a phone the menu is one row beside the logo; it scrolls sideways within that row
          rather than clipping the last item or widening the page. The padding keeps the focus
          ring, drawn outside each link, inside the scrolling row. */}
      <ul className="flex gap-1 overflow-x-auto p-1 md:flex-col md:overflow-visible md:p-0">
        {PLACES.map((place) => {
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
