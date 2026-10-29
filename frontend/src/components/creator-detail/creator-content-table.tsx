"use client";

import { ContentTags } from "@/components/contents/content-tags";
import { ContentNameButton, ReviewButton } from "@/components/contents/content-row-buttons";
import { DeadlineSortTh } from "@/components/content-plan/deadline-sort";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import { CONTENT_PLAN_EMPTY, type ContentPlanTab, type DeadlineSort } from "@/lib/content-plan";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

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
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th scope="col" className={HEAD}>Konten</th>
            <DeadlineSortTh sort={sort} onToggle={onSortToggle} />
            <th scope="col" className={HEAD}>Status</th>
            {tab === "done" ? null : (
              <th scope="col" className={HEAD}>
                <span className="sr-only">Aksi</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.contentId}
              onClick={() => {
                if (window.getSelection()?.toString()) return;
                onOpen(row.contentId);
              }}
              className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2"
            >
              <td className={`${CELL} min-w-52`}>
                <p className="font-semibold text-ink wrap-anywhere">
                  <ContentNameButton onOpen={() => onOpen(row.contentId)}>{row.name}</ContentNameButton>
                </p>
                <span className="mt-0.5 block text-xs text-muted">{CONTENT_TYPE_LABELS[row.type]}</span>
              </td>
              <td className={`${CELL} whitespace-nowrap`}>
                {formatDate(row.deadline)}
              </td>
              <td className={CELL}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                    {CONTENT_STATUS_LABELS[row.status]}
                  </StatusDot>
                  <ContentTags tags={row.tags} />
                </span>
              </td>
              {tab === "done" ? null : (
                <td className={CELL}>
                  <ReviewButton status={row.status} name={row.name} onOpen={() => onOpen(row.contentId)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
