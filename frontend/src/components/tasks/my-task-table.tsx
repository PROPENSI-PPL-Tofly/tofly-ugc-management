"use client";

import type { ReactNode } from "react";
import { DeadlineSortTh } from "@/components/content-plan/deadline-sort";
import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { ContentTags } from "@/components/contents/content-tags";
import { DueDate, badgeTags } from "@/components/contents/due-date";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcons } from "@/components/ui/platform-icon";
import { Pill, StatusDot } from "@/components/ui/pill";
import { ScrollFrame } from "@/components/ui/scroll-frame";
import { CONTENT_STATUS_TONES, CONTENT_TYPE_LABELS, CONTENT_TYPE_TONES } from "@/lib/content-labels";
import type { DeadlineSort } from "@/lib/content-plan";
import { formatTimestamp } from "@/lib/format";
import { taskStatusLabel, type MyTask } from "@/lib/my-tasks";

// Laid out as the admin's Content Plan: from lg up a plain table, below it each row stacks into a
// card so the deadline and status stay on screen instead of behind a sideways scroll. The header
// row is visually hidden there, and each cell prints its column name from data-label.
const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-middle max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

/**
 * Task Saya's table (PRD 3.16), drawn as the admin's Content Plan: the type as a badge, a missed
 * deadline in red, the other tags beside the status, the platforms in a column of their own. Rows
 * arrive in display order; they carry no buttons, since a row opens Detail Konten (`onDetail`),
 * where the creator hands in a draft or a link.
 */
export function MyTaskTable({
  tasks,
  onDetail,
  emptyMessage = "Belum ada tugas untuk kamu.",
  emptyAction,
  emptyHint = "Tugas baru muncul di sini begitu admin menjadwalkannya.",
  sort = "asc",
  onSortToggle,
}: Readonly<{
  tasks: MyTask[];
  /** Opens the row's content detail panel; every row can show its journey and hand in from it. */
  onDetail: (task: MyTask) => void;
  /** What an empty list means, e.g. that a status filter matched nothing. */
  emptyMessage?: string;
  /** The way out of an empty list, e.g. clearing the filter that emptied it. */
  emptyAction?: ReactNode;
  /** The line under an empty list's message; null where it would not be true (a finished tab). */
  emptyHint?: string | null;
  /** Which way the deadline runs; only shown when the page can turn it over. */
  sort?: DeadlineSort;
  /** Turns the deadline order over; given, the Deadline header becomes its button. */
  onSortToggle?: () => void;
}>) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        hint={emptyAction ? undefined : (emptyHint ?? undefined)}
        action={emptyAction}
      />
    );
  }

  return (
    <ScrollFrame>
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <caption className="sr-only">Daftar Tugas Saya</caption>
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            <th role="columnheader" scope="col" className={HEAD}>
              Nama Konten
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Tipe
            </th>
            {onSortToggle ? (
              // Below lg the board offers its own sort button; the header's leaves that width.
              <DeadlineSortTh sort={sort} onToggle={onSortToggle} stacked />
            ) : (
              <th role="columnheader" scope="col" className={HEAD}>
                Deadline
              </th>
            )}
            <th role="columnheader" scope="col" className={HEAD}>
              Status
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              Platform
            </th>
          </tr>
        </thead>
        {/* Below lg the cards sit apart on the page colour, 12 px between them, so one task never
            reads as the end of the one above it. */}
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
          {tasks.map((task) => (
            // A press anywhere on the row opens its detail, as in the Content Plan; the name is the
            // same door as a real button, for the keyboard and for screen readers.
            <tr
              key={task.id}
              role="row"
              onClick={() => {
                // Dragging across a name to copy it ends in a click here: copying, not opening.
                if (window.getSelection()?.toString()) return;
                onDetail(task);
              }}
              className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2 max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:bg-surface max-lg:px-4 max-lg:py-3"
            >
              <td role="cell" className={`${CELL} wrap-anywhere max-lg:pb-2 max-lg:text-sm max-lg:font-semibold`}>
                <ContentNameButton onOpen={() => onDetail(task)}>{task.name}</ContentNameButton>
                {/* PBI-33 AC 5: words, not a colour, say the admin added to the revision note. */}
                {task.revisionNotesUpdatedAt ? (
                  <span className="block text-xs font-normal text-muted">
                    Catatan diperbarui{" "}
                    <time dateTime={task.revisionNotesUpdatedAt}>{formatTimestamp(task.revisionNotesUpdatedAt)}</time>
                  </span>
                ) : null}
              </td>
              <td role="cell" data-label="Tipe" className={`${CELL} ${LABELLED}`}>
                <Pill tone={CONTENT_TYPE_TONES[task.type]}>{CONTENT_TYPE_LABELS[task.type]}</Pill>
              </td>
              <td role="cell" data-label="Deadline" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                <DueDate deadline={task.deadline} tags={task.tags} />
              </td>
              <td role="cell" data-label="Status" className={`${CELL} ${LABELLED}`}>
                {/* The tags sit beside the status they qualify, as on Content Plan. */}
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusDot tone={CONTENT_STATUS_TONES[task.status]}>{taskStatusLabel(task.status)}</StatusDot>
                  <ContentTags tags={badgeTags(task.tags)} />
                </span>
              </td>
              <td role="cell" data-label="Platform" className={`${CELL} ${LABELLED} max-lg:empty:hidden`}>
                <PlatformIcons platforms={task.platforms} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
