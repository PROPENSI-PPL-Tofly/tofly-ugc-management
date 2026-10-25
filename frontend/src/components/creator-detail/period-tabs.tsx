import Link from "next/link";
import type { ReactNode } from "react";
import { INVOICE_TONES } from "@/components/invoice/invoice-table";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Pill, StatusDot } from "@/components/ui/pill";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";
import {
  DEFAULT_CREATOR_DETAIL_PARAMS,
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_TONES,
  creatorDetailAfterContractChange,
  creatorDetailHref,
  periodProductivity,
  PRODUCTIVITY_TIP,
  type CreatorPeriod,
  type PeriodEarnings,
} from "@/lib/creator-detail";
import { EMPTY, formatContractWindow, formatPercent, formatRevisions, formatRupiah } from "@/lib/format";
import { INVOICE_PATH, INVOICE_STATUS_LABELS } from "@/lib/invoice";

const TAB_BASE =
  "flex min-w-44 flex-col gap-1 rounded-(--radius-control) border px-3 py-2 text-left transition-colors";

// Each state names its own border and surface: stacked on one another, two utilities of the
// same property resolve by stylesheet order, not by which one was meant.
const TAB = `${TAB_BASE} border-rule bg-surface-2 hover:border-ink-2`;
const TAB_ON = `${TAB_BASE} border-accent bg-accent-wash`;

const CARD = "rounded-(--radius-control) border border-rule px-4 py-3";

function Card({ label, children }: Readonly<{ label: ReactNode; children: ReactNode }>) {
  return (
    <div className={CARD}>
      <dt className="flex items-center gap-1 text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function PeriodPerformance({
  period,
  earnings,
  creatorName,
}: Readonly<{ period: CreatorPeriod; earnings: PeriodEarnings | null; creatorName: string }>) {
  const { progress, performance } = period;
  const productivity = periodProductivity(period);
  const known = period.status === "upcoming" ? null : earnings;

  return (
    <section aria-labelledby="period-performance" className="mt-4">
      <h3 id="period-performance" className="sr-only">Performa periode</h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Progres Konten">
          {`${progress.submitted}/${progress.total}`}
          <progress
            value={progress.percent}
            max={100}
            aria-label={`Progres ${progress.percent}%`}
            className="progress mt-2 block h-1.5 w-full"
          >
            {progress.percent}%
          </progress>
        </Card>
        <Card label="Tepat Waktu">{formatPercent(performance.onTimeRate)}</Card>
        <Card label="Rata-rata Revisi">{formatRevisions(performance.avgRevisions)}</Card>
        <Card
          label={
            <>
              Produktivitas
              <InfoTip text={PRODUCTIVITY_TIP} label="Tentang Produktivitas" />
            </>
          }
        >
          <Pill tone={productivity.tone}>{productivity.label}</Pill>
        </Card>
        <Card label="Total Pendapatan">
          {known === null ? (
            EMPTY
          ) : (
            <>
              {formatRupiah(known.amount)}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal">
                <Pill tone={INVOICE_TONES[known.status]}>{INVOICE_STATUS_LABELS[known.status]}</Pill>
                <Link
                  href={`${INVOICE_PATH}?${new URLSearchParams({ q: creatorName })}`}
                  className="font-semibold text-accent-deep underline-offset-2 hover:underline"
                >
                  Lihat Invoice ›
                </Link>
              </span>
            </>
          )}
        </Card>
      </dl>
    </section>
  );
}

/**
 * The creator's contract history: one tab per period, and the performance of the one that is open.
 * Each tab is a link, so a period has an address of its own and opens in a new tab like any
 * other page. The newest period is the bare address, where the page opens by default.
 */
export function PeriodTabs({
  creatorId,
  creatorName = "",
  periods,
  selected,
  earnings = null,
}: Readonly<{
  creatorId: string;
  creatorName?: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
  /** The period whose content is on show; null for a creator without a contract. */
  selected: CreatorPeriod | null;
  earnings?: PeriodEarnings | null;
}>) {
  const newest = periods[0];

  function hrefOf(period: CreatorPeriod): string {
    return creatorDetailHref(
      creatorId,
      period === newest
        ? DEFAULT_CREATOR_DETAIL_PARAMS
        : creatorDetailAfterContractChange(DEFAULT_CREATOR_DETAIL_PARAMS, period.contractId),
    );
  }

  return (
    <Panel>
      <PanelHead title="Periode Kontrak" />

      {selected ? (
        <div className="px-5 pb-5">
          <nav aria-label="Pilih periode kontrak" className="flex flex-wrap gap-2">
            {/* Read left to right in the order they happened, as the prototype lays them out. */}
            {[...periods].reverse().map((period) => {
              const open = period.contractId === selected.contractId;

              return (
                <Link
                  key={period.contractId}
                  href={hrefOf(period)}
                  aria-current={open ? "true" : undefined}
                  className={open ? TAB_ON : TAB}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">
                      Periode {period.periodNumber} · {CONTRACT_TYPE_LABELS[period.type]}
                    </span>
                    <StatusDot tone={PERIOD_STATUS_TONES[period.status]}>
                      {PERIOD_STATUS_LABELS[period.status]}
                    </StatusDot>
                  </span>
                  <span className="text-xs text-muted">
                    {formatContractWindow(period.startDate, period.endDate)}
                  </span>
                </Link>
              );
            })}
          </nav>

          <PeriodPerformance period={selected} earnings={earnings} creatorName={creatorName} />
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted">Belum ada kontrak</p>
      )}
    </Panel>
  );
}
