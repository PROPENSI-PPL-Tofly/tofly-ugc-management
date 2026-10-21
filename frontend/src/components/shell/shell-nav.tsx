"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PHONE_TARGET } from "@/components/ui/touch-target";
import type { FrameTheme } from "./frame-theme";
import { PlaceIcon, type PlaceIconName } from "./place-icon";

export interface Place {
  href: string;
  label: string;
  icon: PlaceIconName;
  /** Pages reached from this place that should keep it marked as current. */
  covers?: string[];
}

/** A path is inside a place when it is the place itself or a page below it. */
function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Below md each place is a tile in the bar at the foot of the screen: an icon over its name, a
// press about 56px tall (its padding, icon and name) that darkens and shrinks a little under the
// finger. From md up it is a row of the rail, icon beside name. The colours of the resting and
// the current place are the theme's.
const TILE = `flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-1 py-2 text-center text-[11.5px] font-bold leading-tight text-ink-2 transition-[background-color,color,transform] hover:bg-rule-2 hover:text-ink active:scale-[.96] md:min-h-10 md:flex-row md:justify-start md:gap-2.5 md:rounded-(--radius-control) md:px-3 md:py-0 md:text-left md:text-[13px] md:font-semibold ${PHONE_TARGET}`;

/**
 * The menu shared by every role: each role passes its places and its frame's colours, so a new
 * page is a new entry in a list rather than another copy of this markup. Three places fit as
 * three equal tiles on the narrowest phone, so nothing is cut off or scrolls. Client-side only
 * to know which place is on screen.
 */
export function ShellNav({
  label,
  places,
  theme,
}: Readonly<{ label: string; places: Place[]; theme: Pick<FrameTheme, "place" | "placeOn"> }>) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="min-w-0 md:flex-1">
      <ul className="grid grid-cols-3 gap-1.5 md:flex md:flex-col md:gap-1">
        {places.map((place) => {
          const current = [place.href, ...(place.covers ?? [])].some((href) =>
            isWithin(pathname, href),
          );
          return (
            <li key={place.href} className="min-w-0">
              <Link
                href={place.href}
                aria-current={current ? "page" : undefined}
                className={`${TILE} ${theme.place} ${theme.placeOn}`}
              >
                <PlaceIcon name={place.icon} />
                {place.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
