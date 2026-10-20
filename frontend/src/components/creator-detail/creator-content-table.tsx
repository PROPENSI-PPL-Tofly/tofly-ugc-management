"use client";

import { ContentTags } from "@/components/contents/content-tags";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type Tone } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import { needsReview } from "@/lib/content-plan";
import type { ContentType } from "@/lib/contents";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { formatDate } from "@/lib/format";

const HEAD = "px-5 py-3 font-semibold";

// Below lg a row reads as a card, as the roster's and Task Saya's do: cells stack, and a value
// names its column from data-label since the header row is hidden.
const CELL = "px-5 py-3 align-top max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

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
    // Positioned, so the sr-only heading below is laid out inside the scroll area, not the page.
    <div className="relative overflow-x-auto">
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers.
          A <td> keeps none of its own: it is a cell of the explicit row it sits in. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" scope="col" className={HEAD}>
              Konten
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Deadline
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Status
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              {/* The prototype heads this column with nothing; the name stays for a screen reader. */}
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:block">
          {rows.map((row) => {
            const action = needsReview(row.status) ? "Tinjau" : "Detail";

            return (
              // A press anywhere on the row opens its panel, as in the prototype. The button
              // in the last cell is the same door for the keyboard and for screen readers.
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
                  <p className="font-semibold text-ink wrap-anywhere">{row.name}</p>
                  <p className="mt-1">
                    <Pill tone={TYPE_TONES[row.type]}>{CONTENT_TYPE_LABELS[row.type]}</Pill>
                  </p>
                </td>
                <td
                  data-label="Deadline"
                  className={`${CELL} ${LABELLED} whitespace-nowrap`}
                >
                  {formatDate(row.deadline)}
                </td>
                <td data-label="Status" className={`${CELL} ${LABELLED}`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {/* A pill, as the prototype draws a status on this page. */}
                    <Pill tone={CONTENT_STATUS_TONES[row.status]}>
                      {CONTENT_STATUS_LABELS[row.status]}
                    </Pill>
                    <ContentTags tags={row.tags} />
                    {row.revisionCount > 0 ? (
                      <span className="text-xs font-semibold text-amber-ink">
                        Revisi ke-{row.revisionCount}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={`${CELL} max-lg:pt-2`}>
                  <button
                    type="button"
                    // Every row has one; the content's name tells them apart when heard.
                    aria-label={`${action} ${row.name}`}
                    onClick={(event) => {
                      // The row would hear this press too and open the panel a second time.
                      event.stopPropagation();
                      onOpen(row.contentId);
                    }}
                    // A full-width target on a phone, well above WCAG 2.5.8's 24px. The ghost
                    // variant gains a border there, so it still reads as a button in a card.
                    className={`${buttonClasses(needsReview(row.status) ? "accent" : "ghost")} px-2 py-1 max-lg:min-h-11 max-lg:w-full max-lg:border-rule`}
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
