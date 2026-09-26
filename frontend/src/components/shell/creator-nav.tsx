"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Place {
  href: string;
  label: string;
}

const PLACES: Place[] = [{ href: "/creator/tasks", label: "Task Saya" }];

/** A path is inside a place when it is the place itself or a page below it. */
function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The places a creator can go. Client-side only to know which one is on screen. */
export function CreatorNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu creator" className="min-w-0 flex-1">
      <ul className="flex gap-1 overflow-x-auto p-1 md:flex-col md:overflow-visible md:p-0">
        {PLACES.map((place) => (
          <li key={place.href} className="shrink-0">
            <Link
              href={place.href}
              aria-current={isWithin(pathname, place.href) ? "page" : undefined}
              className="block truncate rounded-(--radius-control) px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:bg-rule-2 aria-[current=page]:bg-accent-wash aria-[current=page]:text-accent-deep"
            >
              {place.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
