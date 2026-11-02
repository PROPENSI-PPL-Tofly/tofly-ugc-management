import { InfoTip } from "@/components/ui/info-tip";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { EMPTY, formatTimestamp } from "@/lib/format";
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

/**
 * The one table both link lists are drawn with (PBI-27, 27.6): the admin's "Performa Konten"
 * names whose link each row is, while a creator reads their own numbers with no column for
 * themselves (AC 20). Every row is a submitted link with its four numbers and its data state
 * (AC 19, 22): an empty number reads as a dash, never as 0 (AC 2).
 */
export function LinkPerformanceTable({
  rows,
  showCreator = false,
}: Readonly<{
  rows: readonly PerformanceLinkRow[];
  /** The admin's list names whose link each row is; a creator reads their own. */
  showCreator?: boolean;
}>) {
  return (
    <div className="overflow-x-auto">
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.linkId} className="border-b border-rule last:border-none">
              {showCreator ? <td className={CELL}>{row.creatorName}</td> : null}
              <td className={`${CELL} wrap-anywhere`}>{row.contentName}</td>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
