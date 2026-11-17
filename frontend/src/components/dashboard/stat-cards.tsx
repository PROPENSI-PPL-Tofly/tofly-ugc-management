import Link from "next/link";
import { STAT_CARDS, statCardHref } from "@/lib/creator-dashboard";
import type { TaskStatusFilter } from "@/lib/my-tasks";

// One card as the approved design draws it: a label over a large value, on a firmer 1.5px edge.
// The nearest deadline is the one date among counts, so it sits apart on the navy tile.
const CARD = "block h-full rounded-(--radius-panel) border-[1.5px] px-[18px] py-4";
const COUNT_CARD = `${CARD} border-rule bg-surface shadow-whisper transition-colors hover:border-ink-2 active:bg-surface-2`;
const DATE_CARD = `${CARD} border-ink bg-ink text-accent-ink`;
const LABEL = "mb-2 text-xs font-semibold";
const VALUE = "text-2xl font-extrabold tabular-nums";

/**
 * The creator dashboard's summary row (PBI-7, subtask 7.3): one card per status the creator
 * still has to act on, each a link to Task Saya for that status, and the nearest deadline
 * beside them. It only draws what it is handed; where the numbers come from is the page's job.
 */
export function StatCards({
  counts,
  nearestDeadline,
}: Readonly<{
  /** Tasks per status; a status left out counts as zero. */
  counts: Readonly<Partial<Record<TaskStatusFilter, number>>>;
  /** The Deadline Terdekat card's text, already worded. */
  nearestDeadline: string;
}>) {
  return (
    <ul className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      {STAT_CARDS.map((card) => (
        <li key={card.status}>
          <Link href={statCardHref(card.status)} className={COUNT_CARD}>
            <p className={`${LABEL} text-ink-2`}>{card.label}</p>
            <p className={`${VALUE} text-ink`}>{counts[card.status] ?? 0}</p>
          </Link>
        </li>
      ))}
      <li>
        <div data-emphasis="true" className={DATE_CARD}>
          <p className={`${LABEL} text-rule`}>Deadline Terdekat</p>
          <p className={VALUE}>{nearestDeadline}</p>
        </div>
      </li>
    </ul>
  );
}
