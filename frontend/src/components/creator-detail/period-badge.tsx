import { Pill } from "@/components/ui/pill";
import { PERIOD_STATUS_LABELS, PERIOD_STATUS_TONES, type CreatorPeriod } from "@/lib/creator-detail";

/** Which period a panel is about, worded and coloured the same on every panel that shows it. */
export function PeriodBadge({ period }: Readonly<{ period: Pick<CreatorPeriod, "periodNumber" | "status"> }>) {
  return (
    <Pill tone={PERIOD_STATUS_TONES[period.status]}>
      Periode {period.periodNumber} · {PERIOD_STATUS_LABELS[period.status]}
    </Pill>
  );
}
