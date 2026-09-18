"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PLACES = [{ href: "/admin/creators", label: "Creator Database" }];

/** The places an admin can go. Client-side only to know which one is on screen. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu admin" className="min-w-0 flex-1">
      <ul className="flex gap-1 md:flex-col">
        {PLACES.map((place) => {
          const current = pathname === place.href || pathname.startsWith(`${place.href}/`);
          return (
            <li key={place.href}>
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
