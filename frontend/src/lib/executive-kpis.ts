// The KPI block of GET /dashboard/executive (PBI-24.2): six figures for the chosen range and the
// same six for the range of equal length before it. Pure module — no fetch, no clock.
//
// PROVISIONAL: the key names and the block's shape are this subtask's proposal to SCRUM-311 and
// stay so until its owner confirms them; src/test/fixtures/executive-kpis.contract.json is the
// shared example both sides test against. The backend computes every figure; the frontend only
// compares a figure with its previous value.
//
// The answer is checked key by key (OWASP A08) and fails closed (OWASP A06): null is "no data"
// and shows as a dash, while a missing or unusable value fails only its own card, so one bad
// figure never hides the other five or the charts, and is never shown as a zero.

/** The six KPIs, in the order the dashboard shows them. */
export const KPI_KEYS = [
  "totalSpending",
  "unpaidAmount",
  "totalViews",
  "costPer1000Views",
  "onTimeRate",
  "engagementRate",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

/** A figure, or null when there is no data for it. */
export type KpiValue = number | null;

/** One card's figures, or the mark that the backend's answer for it could not be used. */
export type KpiReading =
  | { status: "ok"; current: KpiValue; previous: KpiValue }
  | { status: "failed" };

export interface ExecutiveKpis {
  readings: Readonly<Record<KpiKey, KpiReading>>;
  /** Links sent in the range that have no numbers yet (current range only); null when unknown. */
  linksAwaitingData: number | null;
}

type Rule = (value: number) => boolean;

/** Rupiah and counts: whole numbers, never below zero. */
const isWhole: Rule = (value) => Number.isSafeInteger(value) && value >= 0;
/** A Rupiah figure that may carry decimals, such as a cost per 1.000 views. */
const isNonNegative: Rule = (value) => Number.isFinite(value) && value >= 0;
/** A rate on the 0–100 scale. */
const isShare: Rule = (value) =>
  Number.isFinite(value) && value >= 0 && value <= 100;

const RULES: Readonly<Record<KpiKey, Rule>> = {
  totalSpending: isWhole,
  unpaidAmount: isWhole,
  totalViews: isWhole,
  costPer1000Views: isNonNegative,
  onTimeRate: isShare,
  engagementRate: isShare,
};

const FAILED: KpiReading = { status: "failed" };

/** Every card failed: what the page shows when the block itself cannot be used. */
export const FAILED_KPIS: ExecutiveKpis = {
  readings: Object.fromEntries(KPI_KEYS.map((key) => [key, FAILED])) as Record<
    KpiKey,
    KpiReading
  >,
  linksAwaitingData: null,
};

type Period = Record<string, unknown>;

function isPeriod(value: unknown): value is Period {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value the backend sent for a key: a usable figure, null for no data, undefined when unusable. */
function read(period: Period, key: string, rule: Rule): KpiValue | undefined {
  // Own keys only, so nothing inherited is read as a figure the backend sent.
  if (!Object.hasOwn(period, key)) return undefined;
  const value = period[key];
  if (value === null) return null;
  return typeof value === "number" && rule(value) ? value : undefined;
}

/** The KPI block as the cards' readings, each card standing or failing on its own figures. */
export function toExecutiveKpis(raw: unknown): ExecutiveKpis {
  if (!isPeriod(raw) || !isPeriod(raw.current) || !isPeriod(raw.previous))
    return FAILED_KPIS;
  const { current, previous } = raw;

  const links = read(current, "linksAwaitingData", isWhole);

  const readings = Object.fromEntries(
    KPI_KEYS.map((key) => {
      const now = read(current, key, RULES[key]);
      const before = read(previous, key, RULES[key]);
      // Total Views also shows the waiting-links count, so it fails with that count too.
      const usable =
        now !== undefined &&
        before !== undefined &&
        (key !== "totalViews" || links !== undefined);
      return [
        key,
        usable ? { status: "ok", current: now, previous: before } : FAILED,
      ];
    }),
  ) as Record<KpiKey, KpiReading>;

  return { readings, linksAwaitingData: links ?? null };
}
