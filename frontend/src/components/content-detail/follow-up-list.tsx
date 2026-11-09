import type { FollowUp } from "@/lib/content-detail";
import { formatTimestamp } from "@/lib/format";
import { RichNote } from "./rich-note";

/**
 * The follow-ups under a revision note, oldest first, each labelled and timed. The note above
 * them is never rewritten; these read as additions to it, indented on the same rule.
 */
export function FollowUpList({ followUps }: Readonly<{ followUps: readonly FollowUp[] }>) {
  if (followUps.length === 0) return null;

  return (
    <ol aria-label="Catatan susulan" className="mt-2 flex flex-col gap-2">
      {followUps.map((followUp) => (
        <li
          key={followUp.id}
          className="ml-3 rounded-r-(--radius-control) border-l-2 border-rule bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed"
        >
          <p className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold text-muted">
            <span>Catatan susulan</span>
            <time dateTime={followUp.at} className="font-normal">
              {formatTimestamp(followUp.at)}
            </time>
          </p>
          {followUp.noteHtml ? (
            <RichNote html={followUp.noteHtml} />
          ) : (
            <p className="whitespace-pre-line">{followUp.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
