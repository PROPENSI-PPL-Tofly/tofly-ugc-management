"use client";

import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TAG_LABELS,
  CONTENT_TAG_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import { needsReview } from "@/lib/content-plan";
import type { ContentType } from "@/lib/contents";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

/** The type sits under the name as a small pill, coloured apart as the prototype colours them. */
const TYPE_TONES: Record<ContentType, Tone> = {
  evergreen: "accent",
  specific: "red",
};

/**
 * One period's content: a row per piece, its status and tags worded the way every other admin
 * view words them, and the row that awaits a decision given the review button rather than the
 * quiet detail one. Names are rendered as text, so what was typed into one is shown and never
 * run (OWASP A03).
 */
export function CreatorContentTable({
  rows,
  filtered,
  onOpen,
}: Readonly<{
  rows: readonly CreatorContentRow[];
  /** Whether a filter narrowed the table, which changes what an empty table means. */
  filtered: boolean;
  onOpen: (contentId: string) => void;
}>) {
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        title="Tidak ada konten sesuai filter."
        hint="Longgarkan filternya atau tekan Reset."
      />
    ) : (
      <EmptyState title="Belum ada konten pada periode kontrak ini." />
    );
  }

  return (
    <div className="overflow-x-auto">
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
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const action = needsReview(row.status) ? "Tinjau" : "Detail";

            return (
              // A press anywhere on the row opens its panel, as in the prototype. The button
              // in the last cell is the same door for the keyboard and for screen readers.
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
                  <p className="font-semibold text-ink wrap-anywhere">{row.name}</p>
                  <p className="mt-1">
                    <Pill tone={TYPE_TONES[row.type]}>{CONTENT_TYPE_LABELS[row.type]}</Pill>
                  </p>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>{formatDate(row.deadline)}</td>
                <td className={CELL}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                      {CONTENT_STATUS_LABELS[row.status]}
                    </StatusDot>
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
                <td className={CELL}>
                  <button
                    type="button"
                    // Every row has one; the content's name tells them apart when heard.
                    aria-label={`${action} ${row.name}`}
                    onClick={(event) => {
                      // The row would hear this press too and open the panel a second time.
                      event.stopPropagation();
                      onOpen(row.contentId);
                    }}
                    className={`${buttonClasses(needsReview(row.status) ? "accent" : "ghost")} px-2 py-1`}
                  >
                    {action}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
