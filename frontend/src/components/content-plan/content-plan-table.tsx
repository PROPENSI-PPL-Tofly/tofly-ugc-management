"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TAG_LABELS,
  CONTENT_TAG_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import {
  CONTENT_PLAN_EMPTY,
  CONTENT_PLAN_FILTERED_EMPTY,
  needsReview,
  type ContentPlanRow,
  type ContentPlanTab,
  type DeadlineSort,
} from "@/lib/content-plan";
import { creatorDetailBase } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";
import { DeadlineSortTh } from "./deadline-sort";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

/**
 * The Content Plan's table: one row per piece, its status and tags read the same way every
 * other admin view words them, and the row that awaits a decision gets the review button
 * rather than the quiet detail one.
 */
export function ContentPlanTable({
  items,
  filtered,
  tab,
  sort,
  onSortToggle,
  onOpen,
}: Readonly<{
  items: readonly ContentPlanRow[];
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered: boolean;
  tab: ContentPlanTab;
  sort: DeadlineSort;
  onSortToggle: () => void;
  onOpen: (contentId: string) => void;
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={filtered ? CONTENT_PLAN_FILTERED_EMPTY : CONTENT_PLAN_EMPTY[tab]}
        hint={
          filtered
            ? "Longgarkan pencarian atau filternya."
            : undefined
        }
      />
    );
  }

  return (
    // Positioned, so the visually hidden headings below lg are laid out inside this area.
    <div className="relative overflow-x-auto">
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" className={HEAD}>Nama Konten</th>
            <th role="columnheader" className={HEAD}>Kreator</th>
            <th role="columnheader" className={HEAD}>Tipe</th>
            <DeadlineSortTh sort={sort} onToggle={onSortToggle} />
            <th role="columnheader" className={HEAD}>Status</th>
            <th role="columnheader" className={HEAD}>Tags</th>
            <th role="columnheader" className={HEAD}>Aksi</th>
          </tr>
        </thead>
        {/* Below lg each piece is a card of its own, 12 px apart on the page colour, as Task
            Saya's tasks are; a value names its column from data-label. */}
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
          {items.map((row) => (
            // A press anywhere on the row opens its panel, as in the prototype. The button in
            // the last cell is the same door for the keyboard and for screen readers.
            <tr
              key={row.contentId}
              role="row"
              onClick={() => {
                // Dragging across a name to copy it ends in a click here: copying, not opening.
                if (window.getSelection()?.toString()) return;
                onOpen(row.contentId);
              }}
              className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2 max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:bg-surface max-lg:px-4 max-lg:py-3"
            >
              <td role="cell" className={`${CELL} wrap-anywhere max-lg:pb-2 max-lg:text-sm max-lg:font-semibold`}>
                {row.name}
              </td>
              <td role="cell" data-label="Kreator" className={`${CELL} ${LABELLED}`}>
                {/* The way to this creator's detail page, which holds their content plan. It is
                    a link of its own, so the row must not open the panel on the same press. */}
                <Link
                  href={creatorDetailBase(row.creatorId)}
                  onClick={(event) => event.stopPropagation()}
                  className="underline decoration-rule underline-offset-[3px] hover:decoration-ink"
                >
                  {row.creatorName}
                </Link>
              </td>
              <td role="cell" data-label="Tipe" className={`${CELL} ${LABELLED}`}>
                {CONTENT_TYPE_LABELS[row.type]}
              </td>
              <td role="cell" data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                {formatDate(row.deadline)}
              </td>
              <td role="cell" data-label="Status" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                  {CONTENT_STATUS_LABELS[row.status]}
                </StatusDot>
              </td>
              {/* Empty when there is nothing to flag, so a card shows no bare Tags line. */}
              <td role="cell" data-label="Tags" className={`${CELL} ${LABELLED} max-lg:empty:hidden`}>
                {row.tags.length > 0 || row.revisionCount > 0 ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.tags.map((tag) => (
                      <Pill key={tag} tone={CONTENT_TAG_TONES[tag]}>
                        {CONTENT_TAG_LABELS[tag]}
                      </Pill>
                    ))}
                    {row.revisionCount > 0 ? (
                      <span className="text-xs font-semibold text-amber-ink">
                        Revisi ke-{row.revisionCount}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </td>
              <td role="cell" className={`${CELL} max-lg:pt-2`}>
                <button
                  type="button"
                  // Every row has one; the content's name tells them apart when heard.
                  aria-label={`${needsReview(row.status) ? "Tinjau" : "Detail"} ${row.name}`}
                  onClick={(event) => {
                    // The row would hear this press too and open the panel a second time.
                    event.stopPropagation();
                    onOpen(row.contentId);
                  }}
                  // A full-width target on a phone, well above WCAG 2.5.8's 24 px; the ghost
                  // Detail gains a border there so it still reads as a button.
                  className={`${buttonClasses(needsReview(row.status) ? "accent" : "ghost")} px-2 py-1 max-lg:min-h-11 max-lg:w-full max-lg:border-rule`}
                >
                  {needsReview(row.status) ? "Tinjau" : "Detail"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
