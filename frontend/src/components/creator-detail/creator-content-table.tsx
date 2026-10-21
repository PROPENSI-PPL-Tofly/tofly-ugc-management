"use client";

import { ContentTags } from "@/components/contents/content-tags";
import { ContentNameButton, ReviewButton } from "@/components/contents/content-row-buttons";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
  tableTags,
} from "@/lib/content-labels";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

/**
 * One period's content: a row per piece, its status and tags worded the way every other admin
 * view words them, its name opens its panel, and the row that awaits a decision also gets the
 * review button. Names are rendered as text, so what was typed into one is shown and never
 * run (OWASP A03).
 */
export function CreatorContentTable({
  rows,
  filtered,
  onOpen,
  onReset,
}: Readonly<{
  rows: readonly CreatorContentRow[];
  /** Whether a filter narrowed the table, which changes what an empty table means. */
  filtered: boolean;
  onOpen: (contentId: string) => void;
  /** Clears the filters that emptied the table. */
  onReset: () => void;
}>) {
  if (rows.length === 0) {
    return filtered ? (
      <FilteredEmpty title="Tidak ada konten sesuai filter." onReset={onReset} />
    ) : (
      <EmptyState title="Belum ada konten pada periode kontrak ini." />
    );
  }

  return (
    // Positioned, so the sr-only heading below is laid out inside the scroll area, not the page.
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th scope="col" className={HEAD}>
              Konten
            </th>
            <th scope="col" className={HEAD}>
              Deadline
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              {/* The prototype heads this column with nothing; the name stays for a screen reader. */}
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            // A press anywhere on the row opens its panel, as in the prototype. The name is a
            // real button, the same door for the keyboard and for screen readers.
            <tr
              key={row.contentId}
              onClick={() => {
                // Dragging across a name to copy it ends in a click here: copying, not opening.
                if (window.getSelection()?.toString()) return;
                onOpen(row.contentId);
              }}
              className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2"
            >
              <td className={`${CELL} min-w-52`}>
                <p className="font-semibold text-ink wrap-anywhere">
                  <ContentNameButton onOpen={() => onOpen(row.contentId)}>{row.name}</ContentNameButton>
                </p>
                {/* The type as quiet text, as Content Plan and Task Saya show it: a fact, not a judgment. */}
                <span className="mt-0.5 block text-xs text-muted">{CONTENT_TYPE_LABELS[row.type]}</span>
              </td>
              <td className={`${CELL} whitespace-nowrap`}>{formatDate(row.deadline)}</td>
              <td className={CELL}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                    {CONTENT_STATUS_LABELS[row.status]}
                  </StatusDot>
                  <ContentTags tags={tableTags(row.tags)} />
                </span>
              </td>
              <td className={CELL}>
                <ReviewButton status={row.status} name={row.name} onOpen={() => onOpen(row.contentId)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
