"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, PanelHead } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button-classes";
import { isEmptyChart, type ChartRow, type ChartSegment } from "@/lib/executive-dashboard";
import { formatCompact, formatCount, formatRupiah, formatRupiahShort } from "@/lib/format";

type Format = (value: number) => string;

/**
 * What a chart counts, by name. The page is a server component and a function cannot cross into
 * a client one, so the page names the unit and the chart picks its formats here: the full value
 * for the tooltip and the table, the short one for the axis.
 */
export type ChartUnit = "rupiah" | "count";

const UNIT_FORMATS: Record<ChartUnit, { full: Format; axis: Format }> = {
  rupiah: { full: formatRupiah, axis: formatRupiahShort },
  count: { full: formatCount, axis: formatCompact },
};

/**
 * What hovering a month shows: each part of its stack and their total, in the chart's own
 * format. Kept apart from Recharts so it can be tested and reused by any of the three charts.
 */
export function ChartTooltipBody<K extends string>({
  row,
  segments,
  format,
}: Readonly<{ row: ChartRow<K>; segments: readonly ChartSegment<K>[]; format: Format }>) {
  return (
    <div className="rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-[12.5px] shadow-whisper">
      <p className="font-semibold">{row.label}</p>
      <ul className="mt-1 space-y-0.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: segment.color }} />
              {segment.label}
            </span>
            <span className="tabular-nums">{format(row.values[segment.key])}</span>
          </li>
        ))}
        <li className="flex justify-between gap-4 border-t border-rule pt-0.5 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{format(row.total)}</span>
        </li>
      </ul>
    </div>
  );
}

function ChartTable<K extends string>({
  title,
  rows,
  segments,
  format,
}: Readonly<{ title: string; rows: readonly ChartRow<K>[]; segments: readonly ChartSegment<K>[]; format: Format }>) {
  return (
    <div className="overflow-x-auto px-5 pb-5">
      <table aria-label={title} className="w-full text-[13px]">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-2 text-left font-semibold">
              Bulan
            </th>
            {segments.map((segment) => (
              <th key={segment.key} scope="col" className="py-2 text-right font-semibold">
                {segment.label}
              </th>
            ))}
            <th scope="col" className="py-2 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month} className="border-t border-rule">
              <td className="py-2">{row.label}</td>
              {segments.map((segment) => (
                <td key={segment.key} className="py-2 text-right tabular-nums">
                  {format(row.values[segment.key])}
                </td>
              ))}
              <td className="py-2 text-right font-semibold tabular-nums">{format(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One of the executive Dashboard's monthly charts (PBI-24, AC Charts): a bar per month stacked
 * by part, a legend, the numbers on hover and the same numbers as a table behind "Lihat Tabel".
 * The axis is written short; the tooltip and the table write the full value (see ChartUnit).
 *
 * Open/Closed: Spending, Views and Ketepatan Pengiriman are the same component with other
 * rows, segments and formats; a fourth chart is another call, not an edit.
 */
export function StackedBarChart<K extends string>({
  title,
  hint,
  rows,
  segments,
  unit,
  emptyTitle,
}: Readonly<{
  title: string;
  hint?: string;
  rows: readonly ChartRow<K>[];
  segments: readonly ChartSegment<K>[];
  unit: ChartUnit;
  emptyTitle: string;
}>) {
  const { full: format, axis: axisFormat } = UNIT_FORMATS[unit];
  const [asTable, setAsTable] = useState(false);
  const empty = isEmptyChart(rows);

  const toggle = empty ? undefined : (
    <button type="button" className={buttonClasses()} onClick={() => setAsTable((shown) => !shown)}>
      {asTable ? "Lihat Grafik" : "Lihat Tabel"}
    </button>
  );

  return (
    <Panel>
      <PanelHead title={title} hint={hint} action={toggle} />

      {empty ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <>
          <ul aria-label={`Legenda ${title}`} className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-2 text-[12.5px] text-ink-2">
            {segments.map((segment) => (
              <li key={segment.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: segment.color }} />
                {segment.label}
              </li>
            ))}
          </ul>

          {asTable ? (
            <ChartTable title={title} rows={rows} segments={segments} format={format} />
          ) : (
            <div className="h-64 px-2 pb-4" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.map((row) => ({ label: row.label, ...row.values, row }))}>
                  <CartesianGrid vertical={false} stroke="var(--color-rule)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={axisFormat} tickLine={false} axisLine={false} fontSize={12} width={72} />
                  <Tooltip
                    cursor={{ fill: "var(--color-accent-wash)" }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload?.row as ChartRow<K> | undefined;
                      return active && row ? <ChartTooltipBody row={row} segments={segments} format={format} /> : null;
                    }}
                  />
                  {segments.map((segment) => (
                    <Bar key={segment.key} dataKey={segment.key} name={segment.label} stackId="stack" fill={segment.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
