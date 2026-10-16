"use client";

import Link from "next/link";
import { ContentNameButton, ReviewButton } from "@/components/contents/content-row-buttons";
import { FilteredEmpty } from "@/components/filters/filter-controls";
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
  type ContentPlanRow,
  type ContentPlanTab,
  type DeadlineSort,
} from "@/lib/content-plan";
import { creatorDetailBase } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";
import { DeadlineSortTh } from "./deadline-sort";

/**
 * The Content Plan's table: one row per piece, its status and tags read the same way every
 * other admin view words them, its name opens its panel, and the row that awaits a decision
 * also gets the review button.
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
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th className="px-5 py-3 font-semibold">Nama Konten</th>
            <th className="px-5 py-3 font-semibold">Kreator</th>
            <th className="px-5 py-3 font-semibold">Tipe</th>
            <DeadlineSortTh sort={sort} onToggle={onSortToggle} />
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 font-semibold">Tags</th>
            <th className="px-5 py-3 font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
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
              <td className="px-5 py-3">
                <ContentNameButton onOpen={() => onOpen(row.contentId)}>{row.name}</ContentNameButton>
              </td>
              <td className="px-5 py-3">
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
              <td className="px-5 py-3">{CONTENT_TYPE_LABELS[row.type]}</td>
              <td className="px-5 py-3 whitespace-nowrap">{formatDate(row.deadline)}</td>
              <td className="px-5 py-3 whitespace-nowrap">
                <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                  {CONTENT_STATUS_LABELS[row.status]}
                </StatusDot>
              </td>
              <td className="px-5 py-3">
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
              </td>
              <td className="px-5 py-3">
                <ReviewButton status={row.status} name={row.name} onOpen={() => onOpen(row.contentId)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
