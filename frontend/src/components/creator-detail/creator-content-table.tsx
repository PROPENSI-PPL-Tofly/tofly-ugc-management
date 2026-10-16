"use client";

import { ContentTags } from "@/components/contents/content-tags";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import { needsReview } from "@/lib/content-plan";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

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
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      // The row would hear this press too and open the panel a second time.
                      event.stopPropagation();
                      if (window.getSelection()?.toString()) return;
                      onOpen(row.contentId);
                    }}
                    className="cursor-pointer border-none bg-transparent p-0 text-left font-inherit text-inherit hover:underline"
                  >
                    {row.name}
                  </button>
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
                  <ContentTags tags={row.tags} />
                  {row.revisionCount > 0 ? (
                    <span className="text-xs font-semibold text-amber-ink">
                      Revisi ke-{row.revisionCount}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className={CELL}>
                {/* Only a decision due is worth its own button; the name opens everything else. */}
                {needsReview(row.status) ? (
                  <button
                    type="button"
                    // The content's name tells one row's Tinjau from another's when heard.
                    aria-label={`Tinjau ${row.name}`}
                    onClick={(event) => {
                      // The row would hear this press too and open the panel a second time.
                      event.stopPropagation();
                      onOpen(row.contentId);
                    }}
                    className={`${buttonClasses("accent")} px-2 py-1`}
                  >
                    Tinjau
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
