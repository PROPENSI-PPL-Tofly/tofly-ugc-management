import Link from "next/link";
import { STAT_CARDS, statCardHref } from "@/lib/creator-dashboard";
import type { TaskStatusFilter } from "@/lib/my-tasks";

// One card as the prototype draws it: a quiet label over a large value.
const CARD = "block h-full rounded-(--radius-panel) border border-rule bg-surface px-[18px] py-4";
const LABEL = "mb-2 text-xs text-muted";
const VALUE = "text-2xl font-bold text-ink";

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
          <Link href={statCardHref(card.status)} className={`${CARD} hover:border-ink-2`}>
            <p className={LABEL}>{card.label}</p>
            <p className={VALUE}>{counts[card.status] ?? 0}</p>
          </Link>
        </li>
      ))}
      <li>
        <div className={CARD}>
          <p className={LABEL}>Deadline Terdekat</p>
          <p className={VALUE}>{nearestDeadline}</p>
        </div>
      </li>
    </ul>
  );
}
