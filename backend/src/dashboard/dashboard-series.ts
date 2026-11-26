// The three monthly charts (PBI-24, AC 4): spending by component, views by platform and
// delivery timeliness. Pure grouping over plain rows, so the stacking and the "no data" rule are
// tested without a database or a clock of their own.

import { contentOutcome } from '../creators/creator-metrics.js';
import type { ExecutiveChart } from './dto/executive-dashboard.dto.js';

export interface SeriesInvoice {
  /** ISO day the invoice was finalized on. */
  finalizedAt: string;
  fixedRate: number;
  additionalContent: number;
  performanceBonus: number;
  /** The snapshot's total: already past penalties and adjustments. */
  total: number;
}

export interface SeriesLink {
  /** ISO day the link was handed in. */
  submittedAt: string;
  platform: 'instagram' | 'tiktok' | null;
  views: number | null;
  dataState: string;
}

export interface SeriesContent {
  deadline: string;
  videoSubmittedAt: string | null;
  isProposal: boolean;
}

const SPENDING_PARTS = [
  { key: 'fixedRate', label: 'Fixed Rate' },
  { key: 'additionalContent', label: 'Konten Tambahan' },
  { key: 'performanceBonus', label: 'Bonus Performa' },
] as const;

const VIEW_PARTS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
] as const;

const DELIVERY_PARTS = [
  { key: 'on_time', label: 'Tepat Waktu' },
  { key: 'late', label: 'Terlambat' },
  { key: 'not_sent', label: 'Belum Dikirim' },
] as const;

const HAS_NUMBERS = ['synced', 'manual'];

function atMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

const monthOf = (day: string): string => day.slice(0, 7);

/** An array of months in order, each with one value per part. */
function stack<T extends string>(
  rows: readonly { month: string }[],
  parts: readonly { key: T; label: string }[],
  value: (row: never, part: T) => number,
): ExecutiveChart['months'] {
  const byMonth = new Map<string, Map<T, number>>();
  for (const row of rows) {
    const values = byMonth.get(row.month) ?? new Map(parts.map((part) => [part.key, 0]));
    for (const part of parts) {
      values.set(part.key, values.get(part.key)! + value(row as never, part.key));
    }
    byMonth.set(row.month, values);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      parts: parts.map((part) => ({ key: part.key, label: part.label, value: values.get(part.key)! })),
      total: [...values.values()].reduce((sum, amount) => sum + amount, 0),
    }));
}

function spendingMonths(rows: readonly SeriesInvoice[]): ExecutiveChart['months'] {
  const byMonth = new Map<string, SeriesInvoice[]>();
  for (const row of rows) {
    const month = monthOf(row.finalizedAt);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, invoices]) => {
      const total = invoices.reduce((sum, row) => sum + Math.max(0, row.total), 0);
      const gross = invoices.reduce(
        (sum, row) => sum + row.fixedRate + row.additionalContent + row.performanceBonus,
        0,
      );
      // A penalty or adjustment lowers every part in proportion so the stacked bar still adds up.
      const scale = gross === 0 ? 0 : total / gross;
      const parts = SPENDING_PARTS.map((part) => ({
        key: part.key,
        label: part.label,
        value: Math.round(
          invoices.reduce(
            (sum, row) => sum + row[part.key],
            0,
          ) * scale,
        ),
      }));
      const remainder = total - parts.reduce((sum, part) => sum + part.value, 0);
      if (remainder !== 0 && parts.length > 0) parts[0].value += remainder;
      return { month, parts, total };
    });
}

function viewsMonths(rows: readonly SeriesLink[]): ExecutiveChart['months'] {
  const measured = rows.filter(
    (row) =>
      row.platform !== null &&
      row.views !== null &&
      HAS_NUMBERS.includes(row.dataState),
  );
  return stack(
    measured.map((row) => ({ month: monthOf(row.submittedAt), row })),
    VIEW_PARTS,
    (entry, part) => (entry.row.platform === part ? entry.row.views! : 0),
  );
}

function timelinessMonths(
  rows: readonly SeriesContent[],
  today: Date,
): ExecutiveChart['months'] {
  return stack(
    rows
      .filter((row) => !row.isProposal)
      .map((row) => ({ month: monthOf(row.deadline), row })),
    DELIVERY_PARTS,
    (entry, part) => {
      const outcome = contentOutcome(
        {
          deadline: atMidnight(entry.row.deadline),
          videoSubmittedAt:
            entry.row.videoSubmittedAt === null
              ? null
              : atMidnight(entry.row.videoSubmittedAt),
          isProposal: false,
          type: 'evergreen',
          submissionCount: 0,
        },
        today,
      );
      const bucket =
        outcome === 'on_time' ? 'on_time' : outcome === 'open' ? 'not_sent' : 'late';
      return bucket === part ? 1 : 0;
    },
  );
}

/**
 * Three charts, each with its legend and the same rows a "Lihat Tabel" toggle can show.
 */
export function buildCharts(
  invoices: readonly SeriesInvoice[],
  links: readonly SeriesLink[],
  contents: readonly SeriesContent[],
  today: Date,
): ExecutiveChart[] {
  return [
    {
      key: 'spending',
      title: 'Spending per Bulan',
      legend: SPENDING_PARTS.map((part) => ({ key: part.key, label: part.label })),
      months: spendingMonths(invoices),
    },
    {
      key: 'views',
      title: 'Views per Bulan',
      legend: VIEW_PARTS.map((part) => ({ key: part.key, label: part.label })),
      months: viewsMonths(links),
    },
    {
      key: 'timeliness',
      title: 'Ketepatan Pengiriman',
      legend: DELIVERY_PARTS.map((part) => ({ key: part.key, label: part.label })),
      months: timelinessMonths(contents, today),
    },
  ];
}
