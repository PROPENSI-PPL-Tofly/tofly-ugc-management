import type { ContentTag } from "@/lib/creators";
import { CONTENT_TAG_LABELS } from "@/lib/content-labels";
import { formatDate } from "@/lib/format";

/** The tags a red deadline stands for, so a table shows them on the date rather than as badges. */
export const DEADLINE_TAGS: readonly ContentTag[] = ["overdue", "late_submission"];

/**
 * A content's deadline in a table row: red when it was missed, whether the link is still owed
 * (Overdue) or came in after it (Late Submission). The tag is still spoken after the date, so
 * colour is never the only signal.
 */
export function DueDate({ deadline, tags }: Readonly<{ deadline: string; tags: readonly ContentTag[] }>) {
  const missed = DEADLINE_TAGS.find((tag) => tags.includes(tag));

  return (
    <span className={missed ? "font-semibold text-red-ink" : undefined}>
      {formatDate(deadline)}
      {missed ? <span className="sr-only"> ({CONTENT_TAG_LABELS[missed]})</span> : null}
    </span>
  );
}

/** The tags still shown as badges beside the status once the deadline carries the rest. */
export function badgeTags(tags: readonly ContentTag[]): ContentTag[] {
  return tags.filter((tag) => !DEADLINE_TAGS.includes(tag));
}
