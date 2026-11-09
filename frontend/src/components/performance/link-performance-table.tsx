import Link from "next/link";

import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { InfoTip } from "@/components/ui/info-tip";
import { Pill } from "@/components/ui/pill";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { creatorDetailBase } from "@/lib/creator-detail";
import { formatTimestamp } from "@/lib/format";
import {
  DATA_STATE_LABELS,
  DATA_STATE_TONES,
  METRICS,
  formatMetric,
  stateTip,
} from "@/lib/link-performance";
import type { PerformanceLinkRow } from "@/lib/performance-links";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-middle";
const LINK = "underline decoration-rule underline-offset-[3px] hover:decoration-ink";

/**
 * What the ⓘ beside a row's state says: the state's own explanation, then when the link was last
 * synced where that is not already in it, so the sync time needs no column of its own.
 */
function rowTip(row: PerformanceLinkRow): string {
  const tip = stateTip(row, row.creatorName.split(" ")[0]);
  if (row.state === "synced" || row.lastSyncedAt === null) return tip;
  return `${tip} Sinkron terakhir ${formatTimestamp(row.lastSyncedAt)}.`;
}

/**
 * The one table both link lists are drawn with (PBI-27, 27.6): the admin's "Performa Konten"
 * names whose link each row is, while a creator reads their own numbers with no column for
 * themselves (AC 20). Every row is a submitted link with its four numbers and its data state
 * (AC 19, 22): an empty number reads as a dash, never as 0 (AC 2). The state is a coloured badge
 * whose ⓘ also says when the link was last synced.
 */
export function LinkPerformanceTable({
  rows,
  showCreator = false,
  onRowClick,
}: Readonly<{
  rows: readonly PerformanceLinkRow[];
  /** The admin's list names whose link each row is; a creator reads their own. */
  showCreator?: boolean;
  /** The admin's rows open their content's detail (AC 25); a creator's list offers no press. */
  onRowClick?: (row: PerformanceLinkRow) => void;
}>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th scope="col" className={HEAD}>
              Konten
            </th>
            {showCreator ? (
              <th scope="col" className={HEAD}>
                Kreator
              </th>
            ) : null}
            <th scope="col" className={HEAD}>
              Platform
            </th>
            {METRICS.map(({ name, label }) => (
              <th key={name} scope="col" className={HEAD}>
                {label}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              Status Data
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.linkId}
              onClick={
                onRowClick
                  ? () => {
                      // Dragging across a name to copy it ends in a click here: copying, not
                      // opening (the same guard as the admin's other tables).
                      if (window.getSelection()?.toString()) return;
                      onRowClick(row);
                    }
                  : undefined
              }
              className={`border-b border-rule last:border-none ${
                onRowClick ? "relative cursor-pointer transition-colors hover:bg-surface-2" : ""
              }`}
            >
              <td className={`${CELL} min-w-48 wrap-break-word`}>
                {onRowClick ? (
                  <ContentNameButton onOpen={() => onRowClick(row)} underlined>
                    {row.contentName}
                  </ContentNameButton>
                ) : (
                  row.contentName
                )}
              </td>
              {showCreator ? (
                <td className={CELL}>
                  {/* The way to the creator's detail page; a link of its own, so the row does
                      not open the content on the same press. */}
                  <Link
                    href={creatorDetailBase(row.creatorId)}
                    onClick={(event) => event.stopPropagation()}
                    className={LINK}
                  >
                    {row.creatorName}
                  </Link>
                </td>
              ) : null}
              <td className={CELL}>
                {row.platform ? <PlatformIcon platform={row.platform} /> : "Link"}
              </td>
              {METRICS.map(({ name }) => (
                <td key={name} className={`${CELL} tabular-nums`}>
                  {formatMetric(row[name])}
                </td>
              ))}
              <td className={CELL}>
                <span className="flex items-center gap-1.5">
                  <Pill tone={DATA_STATE_TONES[row.state]}>{DATA_STATE_LABELS[row.state]}</Pill>
                  <InfoTip text={rowTip(row)} label={`Tentang ${DATA_STATE_LABELS[row.state]}`} align="end" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
