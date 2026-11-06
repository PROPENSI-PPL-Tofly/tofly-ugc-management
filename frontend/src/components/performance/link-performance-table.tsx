import type { ReactNode } from "react";

import { ContentNameButton } from "@/components/contents/content-row-buttons";
import { InfoTip } from "@/components/ui/info-tip";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatTimestamp } from "@/lib/format";
import {
  DATA_STATE_LABELS,
  METRICS,
  formatMetric,
  stateTip,
} from "@/lib/link-performance";
import { PLATFORM_LABELS } from "@/lib/platform-links";
import type { PerformanceLinkRow } from "@/lib/performance-links";

const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";
/** Stays at the right edge while the columns scroll under it, so the action is always in reach. */
const ACTION = "sticky right-0 bg-surface text-right";

/**
 * The one table both link lists are drawn with (PBI-27, 27.6): the admin's "Performa Konten"
 * names whose link each row is, while a creator reads their own numbers with no column for
 * themselves (AC 20). Every row is a submitted link with its four numbers and its data state
 * (AC 19, 22): an empty number reads as a dash, never as 0 (AC 2).
 */
export function LinkPerformanceTable({
  rows,
  showCreator = false,
  onRowClick,
  actions,
}: Readonly<{
  rows: readonly PerformanceLinkRow[];
  /** The admin's list names whose link each row is; a creator reads their own. */
  showCreator?: boolean;
  /** The admin's rows open their content's detail (AC 25); a creator's list offers no press. */
  onRowClick?: (row: PerformanceLinkRow) => void;
  /** What each row can be done with (the admin's "Sinkronkan"); a creator's list offers none. */
  actions?: (row: PerformanceLinkRow) => ReactNode;
}>) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            {showCreator ? (
              <th scope="col" className={HEAD}>
                Kreator
              </th>
            ) : null}
            <th scope="col" className={HEAD}>
              Konten
            </th>
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
            <th scope="col" className={HEAD}>
              Sinkron Terakhir
            </th>
            {actions ? (
              <th scope="col" className={`${HEAD} ${ACTION}`}>
                <span className="sr-only">Aksi</span>
              </th>
            ) : null}
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
              {showCreator ? <td className={CELL}>{row.creatorName}</td> : null}
              <td className={`${CELL} min-w-48 wrap-break-word`}>
                {onRowClick ? (
                  <ContentNameButton onOpen={() => onRowClick(row)}>
                    {row.contentName}
                  </ContentNameButton>
                ) : (
                  row.contentName
                )}
              </td>
              <td className={CELL}>
                <span className="flex items-center gap-1.5">
                  {row.platform ? <PlatformIcon platform={row.platform} /> : null}
                  {row.platform ? PLATFORM_LABELS[row.platform] : "Link"}
                </span>
              </td>
              {METRICS.map(({ name }) => (
                <td key={name} className={`${CELL} tabular-nums`}>
                  {formatMetric(row[name])}
                </td>
              ))}
              <td className={CELL}>
                <span className="flex items-center gap-1.5">
                  {DATA_STATE_LABELS[row.state]}
                  <InfoTip
                    text={stateTip(row, row.creatorName.split(" ")[0])}
                    label={`Tentang ${DATA_STATE_LABELS[row.state]}`}
                    align="end"
                  />
                </span>
              </td>
              <td className={`${CELL} whitespace-nowrap`}>{formatTimestamp(row.lastSyncedAt)}</td>
              {actions ? <td className={`${CELL} ${ACTION}`}>{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
