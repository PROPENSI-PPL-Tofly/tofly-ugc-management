import { toExecutiveKpis } from "@/lib/executive-kpis";
import { KpiCards } from "./kpi-cards";

/**
 * The KPI row as it streams in (PBI-24.2): the page starts its one GET /dashboard/executive and
 * hands this section the KPI part of the answer as a promise, so the section can sit in a
 * <Suspense key={range}> with KpiCardsSkeleton as its fallback while it waits.
 *
 * A load that fails for any reason, including a session the backend refuses (401/403), shows
 * each card's own error: never figures, never zeros (OWASP A01, A10), and never the reason,
 * which may carry backend detail (OWASP A02). Who may read the figures is decided by the
 * backend; this only makes sure a refusal cannot read as data.
 */
export async function KpiSection({
  kpis,
  months,
  retryHref,
}: Readonly<{
  /** The KPI block of the page's single dashboard load. */
  kpis: Promise<unknown>;
  months: number;
  retryHref: string;
}>) {
  // A rejection becomes "no block", which the adapter reads as six failed cards.
  const raw = await kpis.catch(() => undefined);
  return (
    <KpiCards
      kpis={toExecutiveKpis(raw)}
      months={months}
      retryHref={retryHref}
    />
  );
}
