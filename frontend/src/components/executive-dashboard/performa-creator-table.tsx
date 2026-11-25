"use client";

import { useState } from "react";
import { Panel, PanelHead } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableTh } from "@/components/ui/sortable-th";
import { creatorDetailBase } from "@/lib/creator-detail";
import {
  buildDashboardQuery,
  nextCreatorSort,
  sortCreators,
  type CreatorPerformance,
  type CreatorSortKey,
  type DashboardState,
} from "@/lib/executive-dashboard";
import { EMPTY, formatCount, formatRate, formatRupiah } from "@/lib/format";
import { useUrlQuery } from "@/lib/url-query";

const NUMBER_HINTS = { asc: "Terendah dulu", desc: "Tertinggi dulu" } as const;

const COLUMNS: readonly { key: CreatorSortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Creator", numeric: false },
  { key: "spending", label: "Spending", numeric: true },
  { key: "content", label: "Konten Terkirim", numeric: true },
  { key: "onTime", label: "On-time Rate", numeric: true },
  { key: "views", label: "Views", numeric: true },
  { key: "costPer1000", label: "Biaya per 1.000 Views", numeric: true },
];

function cells(row: CreatorPerformance): string[] {
  return [
    formatRupiah(row.spending),
    `${row.contentSent} / ${row.contentQuota}`,
    formatRate(row.onTimeRate),
    formatCount(row.views),
    row.costPer1000Views === null ? EMPTY : formatRupiah(Math.round(row.costPer1000Views)),
  ];
}

/**
 * Performa Creator (PBI-24, AC Creators): the creators with a contract in the range, sorted by
 * any column. The order lives in the address with the range, so a reload or a shared link shows
 * the same table; the rows arrive whole and are sorted here, never re-fetched: a header press
 * writes the order straight into the address, with no navigation that would load the dashboard
 * again. A creator's name opens their Creator Detail.
 */
export function PerformaCreatorTable({
  creators,
  state,
}: Readonly<{ creators: readonly CreatorPerformance[]; state: DashboardState }>) {
  const { replaceQuietly } = useUrlQuery();
  const [sorting, setSorting] = useState({ sort: state.sort, order: state.order });
  const current: DashboardState = { ...state, ...sorting };
  const rows = sortCreators(creators, current.sort, current.order);

  const press = (key: CreatorSortKey) => {
    const next = nextCreatorSort(current, key);
    setSorting(next);
    replaceQuietly(new URLSearchParams(buildDashboardQuery({ ...current, ...next })).toString());
  };

  return (
    <Panel>
      <PanelHead title="Performa Creator" hint="Creator dengan kontrak di rentang ini." />

      {rows.length === 0 ? (
        <EmptyState title="Belum ada creator dengan kontrak di rentang ini." />
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Performa Creator" className="w-full text-[13px]">
            <thead className="border-y border-rule bg-surface-2 text-muted">
              <tr>
                {COLUMNS.map((column) => (
                  <SortableTh
                    key={column.key}
                    label={column.label}
                    align={column.numeric ? "right" : "left"}
                    direction={current.sort === column.key ? current.order : null}
                    hints={column.numeric ? NUMBER_HINTS : { asc: "A ke Z", desc: "Z ke A" }}
                    onToggle={() => press(column.key)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.creatorId} className="border-t border-rule hover:bg-surface-2">
                  <td className="px-5 py-3 font-semibold">
                    <a href={creatorDetailBase(row.creatorId)} className="text-ink hover:text-accent-deep hover:underline">
                      {row.creatorName}
                    </a>
                  </td>
                  {cells(row).map((value, index) => (
                    <td key={COLUMNS[index + 1].key} className="px-5 py-3 text-right tabular-nums">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
