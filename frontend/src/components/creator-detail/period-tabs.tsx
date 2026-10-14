import Link from "next/link";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";
import {
  DEFAULT_CREATOR_DETAIL_PARAMS,
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_TONES,
  creatorDetailAfterContractChange,
  creatorDetailHref,
  type CreatorPeriod,
} from "@/lib/creator-detail";
import { formatContractWindow } from "@/lib/format";

const TAB_BASE =
  "flex min-w-44 flex-col gap-1 rounded-(--radius-control) border px-3 py-2 text-left transition-colors";

// Each state names its own border and surface: stacked on one another, two utilities of the
// same property resolve by stylesheet order, not by which one was meant.
const TAB = `${TAB_BASE} border-rule bg-surface-2 hover:border-ink-2`;
const TAB_ON = `${TAB_BASE} border-accent bg-accent-wash`;

function Term({ label, children }: Readonly<{ label: string; children: string }>) {
  return (
    <div className="rounded-(--radius-control) border border-rule px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The creator's contract history: one tab per period, and the terms of the one that is open.
 * Each tab is a link, so a period has an address of its own and opens in a new tab like any
 * other page. The newest period is the bare address, where the page opens by default.
 */
export function PeriodTabs({
  creatorId,
  periods,
  selected,
}: Readonly<{
  creatorId: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
  /** The period whose content is on show; null for a creator without a contract. */
  selected: CreatorPeriod | null;
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
                    <Pill tone={PERIOD_STATUS_TONES[period.status]}>
                      {PERIOD_STATUS_LABELS[period.status]}
                    </Pill>
                  </span>
                  <span className="text-xs text-muted">
                    {formatContractWindow(period.startDate, period.endDate)}
                  </span>
                </Link>
              );
            })}
          </nav>

          <dl className="mt-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Term label="Kuota Konten">{`${selected.contentQuota} konten`}</Term>
            <Term label="Sisa Kuota Evergreen">{`${selected.remainingEvergreenQuota} konten`}</Term>
            <Term label="Jarak Antar-Deadline">{`${selected.daysBetween} hari`}</Term>
          </dl>
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted">Belum ada kontrak</p>
      )}
    </Panel>
  );
}
