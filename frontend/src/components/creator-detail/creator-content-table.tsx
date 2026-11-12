"use client";

import { ContentTags } from "@/components/contents/content-tags";
import { DueDate, badgeTags } from "@/components/contents/due-date";
import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { DeadlineSortButton, DeadlineSortTh } from "@/components/content-plan/deadline-sort";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcons } from "@/components/ui/platform-icon";
import { Pill, StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_TONES,
} from "@/lib/content-labels";
import { CONTENT_PLAN_EMPTY, type ContentPlanTab, type DeadlineSort } from "@/lib/content-plan";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { ScrollFrame } from "@/components/ui/scroll-frame";

const HEAD = "px-5 py-3 font-semibold";

// Below lg a row reads as a card, as the roster's and Task Saya's do: cells stack, and a value
// names its column from data-label since the header row is hidden.
// Every cell centred on the row, so the name, its badge, the date, the status and the button
// line up on one axis however many lines the first cell takes.
const CELL = "px-5 py-3 align-middle max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

export function CreatorContentTable({
  rows,
  filtered,
  tab = "all",
  sort = "asc",
  onSortToggle = () => {},
  onOpen,
  onReset,
}: Readonly<{
  rows: readonly CreatorContentRow[];
  filtered: boolean;
  tab?: ContentPlanTab;
  sort?: DeadlineSort;
  onSortToggle?: () => void;
  onOpen: (contentId: string) => void;
  onReset: () => void;
}>) {
  if (rows.length === 0) {
    if (filtered) return <FilteredEmpty title="Tidak ada konten sesuai filter." onReset={onReset} />;
    return (
      <EmptyState
        title={tab === "all" ? "Belum ada konten pada periode kontrak ini." : CONTENT_PLAN_EMPTY[tab]}
      />
    );
  }

  return (
    // Positioned, so the sr-only heading below is laid out inside the scroll area, not the page.
    <ScrollFrame>
      {/* Below lg the header row is hidden, so the deadline sort gets a button of its own. */}
      <DeadlineSortButton sort={sort} onToggle={onSortToggle} />
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers.
          A <td> keeps none of its own: it is a cell of the explicit row it sits in. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" scope="col" className={HEAD}>
              Konten
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Tipe
            </th>
            <DeadlineSortTh sort={sort} onToggle={onSortToggle} stacked />
            <th role="columnheader" scope="col" className={HEAD}>
              Status
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Platform
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:block">
          {rows.map((row) => (
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
              className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2 max-lg:block max-lg:px-5 max-lg:py-3"
            >
              <td className={`${CELL} min-w-52 max-lg:min-w-0`}>
                <p className="font-semibold text-ink wrap-anywhere">
                  <ContentNameButton onOpen={() => onOpen(row.contentId)}>{row.name}</ContentNameButton>
                </p>
              </td>
              <td data-label="Tipe" className={`${CELL} ${LABELLED}`}>
                <Pill tone={CONTENT_TYPE_TONES[row.type]}>{CONTENT_TYPE_LABELS[row.type]}</Pill>
              </td>
              <td data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                <DueDate deadline={row.deadline} tags={row.tags} />
              </td>
              <td data-label="Status" className={`${CELL} ${LABELLED}`}>
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
