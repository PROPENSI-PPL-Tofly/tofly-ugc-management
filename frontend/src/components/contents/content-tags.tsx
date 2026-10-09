import { Pill } from "@/components/ui/pill";
import { CONTENT_TAG_LABELS, CONTENT_TAG_TONES } from "@/lib/content-labels";
import type { ContentTag } from "@/lib/creators";

/** The late, overdue and approval bypassed flags on a content, each a labelled pill. */
export function ContentTags({ tags }: { tags: readonly ContentTag[] }) {
  if (tags.length === 0) return null;

  return (
    <ul aria-label="Tanda konten" className="flex min-w-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag}>
          <Pill tone={CONTENT_TAG_TONES[tag]}>{CONTENT_TAG_LABELS[tag]}</Pill>
        </li>
      ))}
    </ul>
  );
}
