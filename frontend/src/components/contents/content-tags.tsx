import { Pill } from "@/components/ui/pill";
import { CONTENT_TAG_LABELS, CONTENT_TAG_TONES, isShownTag } from "@/lib/content-labels";
import type { ContentTag } from "@/lib/creators";

/** The overdue and approval bypassed flags on a content, each a labelled pill; never a late one. */
export function ContentTags({ tags }: { tags: readonly ContentTag[] }) {
  const shown = tags.filter(isShownTag);
  if (shown.length === 0) return null;

  return (
    <ul aria-label="Tanda konten" className="flex min-w-0 flex-wrap gap-1">
      {shown.map((tag) => (
        <li key={tag}>
          <Pill tone={CONTENT_TAG_TONES[tag]}>{CONTENT_TAG_LABELS[tag]}</Pill>
        </li>
      ))}
    </ul>
  );
}
