import Link from "next/link";
import type { ReactNode } from "react";
import { INVOICE_TONES } from "@/components/invoice/invoice-table";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { ProductivityTip } from "@/components/creators/productivity-tip";
import { PeriodBadge } from "./period-badge";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";
import {
  DEFAULT_CREATOR_DETAIL_PARAMS,
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_TONES,
  creatorDetailAfterContractChange,
  creatorDetailHref,
  periodProductivity,
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

const TAB_NAME = "text-[13px] font-semibold";

const CARD = "rounded-(--radius-control) border border-rule px-4 py-3";

function Card({ label, children }: Readonly<{ label: ReactNode; children: ReactNode }>) {
  return (
    <div className={CARD}>
      <dt className="flex items-center gap-1 text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * How one period went, in a panel of its own under the period picker, with the period's badge
 * beside the title so the numbers are never read as the creator's whole history.
 */
export function PeriodSummary({
  period,
  earnings = null,
  creatorName = "",
}: Readonly<{ period: CreatorPeriod; earnings?: PeriodEarnings | null; creatorName?: string }>) {
  const { progress, performance } = period;
  const productivity = periodProductivity(period);
  const known = period.status === "upcoming" ? null : earnings;

  return (
    // Unclipped: the ⓘ beside Produktivitas opens a bubble that hangs past the panel's edge.
    <Panel clip={false}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pb-3 pt-5">
        <h2 className="text-[15px]">Ringkasan</h2>
        <p data-testid="period-facts" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <PeriodBadge period={period} />
        </p>
      </div>

      <section aria-label="Performa periode" className="px-5 pb-5">
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
                <InfoTip text={<ProductivityTip />} label="Tentang Produktivitas" />
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
    </Panel>
  );
}

/**
 * The creator's contract history: one tab per period, picking the one the summary and the Content
 * Plan below are about. Each tab is a link, so a period has an address of its own and opens in a new tab like any
 * other page. The newest period is the bare address, where the page opens by default.
 */
export function PeriodTabs({
  creatorId,
  periods,
  selected,
  back,
}: Readonly<{
  creatorId: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
  /** The period whose content is on show; null for a creator without a contract. */
  selected: CreatorPeriod | null;
  /** The Creator Database view to return to, which every period's link keeps. */
  back?: string;
}>) {
  const newest = periods[0];
  const bare = back ? { ...DEFAULT_CREATOR_DETAIL_PARAMS, back } : DEFAULT_CREATOR_DETAIL_PARAMS;

  function hrefOf(period: CreatorPeriod): string {
    return creatorDetailHref(
      creatorId,
      period === newest ? bare : creatorDetailAfterContractChange(bare, period.contractId),
    );
  }

  return (
    <Panel>
      <PanelHead title="Periode Kontrak" hint="Pilih periode untuk melihat ringkasan dan content plan-nya." />

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
                  <span className="flex items-center justify-between gap-3">
                    {/* The open period reads in blue, as its border and wash already mark it. */}
                    <span className={open ? `${TAB_NAME} text-accent-deep` : TAB_NAME}>
                      Periode {period.periodNumber} · {CONTRACT_TYPE_LABELS[period.type]}
                    </span>
                    <Pill tone={PERIOD_STATUS_TONES[period.status]}>{PERIOD_STATUS_LABELS[period.status]}</Pill>
                  </span>
                  <span className="text-xs text-muted">
                    {formatContractWindow(period.startDate, period.endDate)}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted">Belum ada kontrak</p>
      )}
    </Panel>
  );
}
