"use client";

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
import { formatDate } from "@/lib/format";
import { DeadlineSortTh } from "./deadline-sort";

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
            <tr key={row.contentId} className="border-b border-rule">
              <td className="px-5 py-3">{row.name}</td>
              <td className="px-5 py-3">{row.creatorName}</td>
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
                <button
                  type="button"
                  // Every row has one; the content's name tells them apart when heard.
                  aria-label={`${needsReview(row.status) ? "Tinjau" : "Detail"} ${row.name}`}
                  onClick={() => onOpen(row.contentId)}
                  className={`${buttonClasses(needsReview(row.status) ? "accent" : "ghost")} px-2 py-1`}
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
