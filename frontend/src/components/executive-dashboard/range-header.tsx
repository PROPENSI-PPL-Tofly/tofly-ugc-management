import Link from "next/link";
import { isSameSitePath } from "@/lib/safe-href";

/** One choice of range: its length in months and the dashboard's address for it. */
export interface RangeOption {
  months: number;
  href: string;
}

// The design's pill: a rounded frame around the choices, the chosen one in brand blue.
const FRAME =
  "ml-auto inline-flex rounded-full border border-rule bg-surface p-0.5";
// On a phone an invisible ::before reaches 10px above and below each 27px choice, about 47px to
// press, while the pill keeps the design's size; nothing else on the row sits that close.
const CHOICE =
  "relative inline-block rounded-full px-3 py-1 text-[12.5px] font-semibold max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-2.5 max-sm:before:content-['']";
const ON = "bg-accent text-accent-ink";
const OFF = "text-ink-2";

/**
 * The Executive Dashboard's header (PBI-24.2): the months shown, and the 3 / 6 / 12 Bulan choice.
 * Links, not buttons: the range lives in the address, so a view can be bookmarked and Back
 * returns to the previous range. The caller builds each address from the page's state (SCRUM-313
 * owns that); a choice that would lead off the site is not drawn (OWASP A05).
 */
export function RangeHeader({
  period,
  options,
  active,
}: Readonly<{
  /** The first and last month shown, already written alike ("Jun 2026"); null when unknown. */
  period: { from: string; to: string } | null;
  options: readonly RangeOption[];
  /** The range shown, in months. */
  active: number;
}>) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {period ? (
        <p className="text-xs text-muted">
          {period.from} – {period.to}
        </p>
      ) : null}
      <div role="group" aria-label="Rentang" className={FRAME}>
        {options
          .filter((option) => isSameSitePath(option.href))
          .map((option) => {
            const chosen = option.months === active;
            return (
              <Link
                key={option.months}
                href={option.href}
                aria-current={chosen ? "page" : undefined}
                className={`${CHOICE} ${chosen ? ON : OFF}`}
              >
                {option.months} Bulan
              </Link>
            );
          })}
      </div>
    </div>
  );
}
