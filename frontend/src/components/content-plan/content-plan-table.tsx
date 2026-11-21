"use client";

import Link from "next/link";
import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { ContentTags } from "@/components/contents/content-tags";
import { DueDate, badgeTags } from "@/components/contents/due-date";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcons } from "@/components/ui/platform-icon";
import { Pill, StatusDot } from "@/components/ui/pill";
import { MIN_TARGET } from "@/components/ui/touch-target";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_TONES,
} from "@/lib/content-labels";
import {
  CONTENT_PLAN_EMPTY,
  CONTENT_PLAN_FILTERED_EMPTY,
  type ContentPlanRow,
  type ContentPlanTab,
  type DeadlineSort,
} from "@/lib/content-plan";
import { creatorDetailBase } from "@/lib/creator-detail";
import { DeadlineSortButton, DeadlineSortTh } from "./deadline-sort";
import { ScrollFrame } from "@/components/ui/scroll-frame";

const HEAD = "px-5 py-3 font-semibold";
// Every cell centred on the row, as Creator Detail's table lays them.
const CELL = "px-5 py-3 align-middle max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

/**
 * The Content Plan's table, laid out as Creator Detail's: the type and the platforms in columns of
 * their own, a missed deadline in red and the other tags beside the status. The row itself is the
 * door into its panel, with the name as the same door for the keyboard; no Tinjau or Detail.
 */
export function ContentPlanTable({
  items,
  filtered,
  tab,
  sort,
  onSortToggle,
  onOpen,
  onReset,
}: Readonly<{
  items: readonly ContentPlanRow[];
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered: boolean;
  tab: ContentPlanTab;
  sort: DeadlineSort;
  onSortToggle: () => void;
  onOpen: (contentId: string) => void;
  /** Clears the search and filters that emptied the list. */
  onReset: () => void;
}>) {
  if (items.length === 0) {
    return filtered ? (
      <FilteredEmpty title={CONTENT_PLAN_FILTERED_EMPTY} onReset={onReset} />
    ) : (
      <EmptyState title={CONTENT_PLAN_EMPTY[tab]} />
    );
  }

  return (
    // Positioned, so the visually hidden headings below lg are laid out inside this area.
    <ScrollFrame>
      {/* Below lg the header row is hidden, so the deadline sort gets a button of its own. */}
      <DeadlineSortButton sort={sort} onToggle={onSortToggle} />
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers.
          A <td> keeps none of its own: it is a cell of the explicit row it sits in. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" className={HEAD}>Nama Konten</th>
            <th role="columnheader" className={HEAD}>Tipe</th>
            <th role="columnheader" className={HEAD}>Kreator</th>
            <DeadlineSortTh sort={sort} onToggle={onSortToggle} stacked />
            <th role="columnheader" className={HEAD}>Status</th>
            <th role="columnheader" className={HEAD}>Platform</th>
          </tr>
        </thead>
        {/* Below lg each piece is a card of its own, 12 px apart on the page colour, as Task
            Saya's tasks are; a value names its column from data-label. */}
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
          {items.map((row) => (
            // A press anywhere on the row opens its panel, as in the prototype. The name is a
            // real button, the same door for the keyboard and for screen readers.
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
              <td className={`${CELL} wrap-anywhere max-lg:pb-2 max-lg:text-sm max-lg:font-semibold`}>
                <ContentNameButton onOpen={() => onOpen(row.contentId)}>{row.name}</ContentNameButton>
              </td>
              <td data-label="Tipe" className={`${CELL} ${LABELLED}`}>
                <Pill tone={CONTENT_TYPE_TONES[row.type]}>{CONTENT_TYPE_LABELS[row.type]}</Pill>
              </td>
              <td data-label="Kreator" className={`${CELL} ${LABELLED}`}>
                {/* The way to this creator's detail page, which holds their content plan. It is
                    a link of its own, so the row must not open the panel on the same press. */}
                <Link
                  href={creatorDetailBase(row.creatorId)}
                  onClick={(event) => event.stopPropagation()}
                  className={`inline-flex items-center underline decoration-rule underline-offset-[3px] hover:decoration-ink ${MIN_TARGET}`}
                >
                  {row.creatorName}
                </Link>
              </td>
              <td data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                <DueDate deadline={row.deadline} tags={row.tags} />
              </td>
              <td data-label="Status" className={`${CELL} ${LABELLED}`}>
                {/* The tags sit beside the status they qualify, as on Creator Detail. */}
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                    {CONTENT_STATUS_LABELS[row.status]}
                  </StatusDot>
                  <ContentTags tags={badgeTags(row.tags)} />
                </span>
              </td>
              <td data-label="Platform" className={`${CELL} ${LABELLED} max-lg:empty:hidden`}>
                <PlatformIcons platforms={row.platforms} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
