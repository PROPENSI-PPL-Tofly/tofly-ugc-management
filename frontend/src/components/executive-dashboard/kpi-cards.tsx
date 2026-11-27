import type { ExecutiveKpis } from "@/lib/executive-kpis";
import { KPI_STRATEGIES } from "@/lib/executive-kpi-strategies";
import { CARD, KpiCard, LABEL } from "./kpi-card";

// The design's KPI row: three across, two across from 900px down, closer together on a phone.
const GRID =
  "mb-4 grid grid-cols-3 gap-3.5 max-[900px]:grid-cols-2 max-[560px]:gap-2.5";
// The design's .skel bar, where the figure will be.
const BAR =
  "mt-1.5 block h-6 w-1/2 animate-shimmer rounded-md motion-reduce:animate-none bg-linear-to-r from-surface-2 via-rule-2 to-surface-2 bg-size-[200%_100%]";

/** The six KPI cards of the Executive Dashboard (PBI-24.2), in the design's order. */
export function KpiCards({
  kpis,
  months,
  retryHref,
}: Readonly<{ kpis: ExecutiveKpis; months: number; retryHref: string }>) {
  return (
    <ul className={GRID}>
      {KPI_STRATEGIES.map((strategy) => (
        <li key={strategy.key}>
          <KpiCard
            strategy={strategy}
            reading={kpis.readings[strategy.key]}
            note={strategy.note?.(kpis) ?? null}
            months={months}
            retryHref={retryHref}
          />
        </li>
      ))}
    </ul>
  );
}

/** While the figures load: the six labels in place, a shimmering bar for each figure (AC 13). */
export function KpiCardsSkeleton() {
  return (
    <ul className={GRID} aria-busy="true">
      {KPI_STRATEGIES.map((strategy) => (
        <li key={strategy.key}>
          <div className={CARD}>
            <p className={LABEL}>{strategy.label}</p>
            <span data-skeleton aria-hidden="true" className={BAR} />
          </div>
        </li>
      ))}
    </ul>
  );
}
