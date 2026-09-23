// How a creator's contract state and performance are worked out.
//
// Everything here is a pure function over plain values: no Prisma types, no database, and no
// clock of its own — the caller passes `today` in. The rules that decide whether someone reads
// as "Berisiko" stay readable and testable on their own, and the service is left with nothing
// but loading rows and handing them over.

export type ContractStatus = 'active' | 'expired' | 'upcoming' | 'none';

export type ContentOutcome = 'on_time' | 'submitted_late' | 'late' | 'open';

export type Productivity = 'good' | 'watch' | 'risk';

export type ProductivityLabel =
  'Baik' | 'Perlu Perhatian' | 'Berisiko' | 'Belum Ada Data';

export interface MetricsContent {
  deadline: Date;
  videoSubmittedAt: Date | null;
  /** Creator-proposed content is not a commitment until an admin accepts it. */
  isProposal: boolean;
  /** Draft hand-ins; the first is the original, so revisions are this minus one. */
  submissionCount: number;
}

export interface MetricsContract {
  id: string;
  startDate: Date;
  endDate: Date;
  contents: MetricsContent[];
}

export interface Progress {
  submitted: number;
  total: number;
  percent: number;
}

export interface Performance {
  /** Share of resolved content delivered by its deadline, or null with nothing resolved. */
  onTimeRate: number | null;
  avgRevisions: number;
  productivity: Productivity;
  productivityLabel: ProductivityLabel;
}

/** At or above this share of on-time deliveries a creator still counts as reliable. */
const ON_TIME_GOOD = 80;
/** Below this share the creator is at risk whatever the revision count. */
const ON_TIME_RISK = 40;
/** Up to this many revisions per content is ordinary editorial back-and-forth. */
const REVISIONS_GOOD = 1;
/** Above this many, the review cycle itself is the problem. */
const REVISIONS_RISK = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC, matching how Postgres `date` columns arrive, so comparisons are day-wise. */
function atMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function contractStatus(
  contract: MetricsContract | null,
  today: Date,
): ContractStatus {
  if (!contract) return 'none';

  const now = atMidnight(today);
  if (now < atMidnight(contract.startDate)) return 'upcoming';
  if (now > atMidnight(contract.endDate)) return 'expired';
  return 'active';
}

/**
 * The contract the table should describe: the one running today, failing that the most
 * recently finished one (a creator whose contract just ended still shows the terms they left),
 * and for a creator who has not started yet, the earliest upcoming one.
 */
export function currentContract<T extends MetricsContract>(
  contracts: T[],
  today: Date,
): T | null {
  if (contracts.length === 0) return null;

  const active = contracts.find(
    (contract) => contractStatus(contract, today) === 'active',
  );
  if (active) return active;

  const finished = contracts.filter(
    (contract) => contractStatus(contract, today) === 'expired',
  );
  if (finished.length > 0) {
    const latestEnd = Math.max(
      ...finished.map((contract) => atMidnight(contract.endDate)),
    );
    return finished.filter(
      (contract) => atMidnight(contract.endDate) === latestEnd,
    )[0];
  }

  const earliestStart = Math.min(
    ...contracts.map((contract) => atMidnight(contract.startDate)),
  );
  return contracts.filter(
    (contract) => atMidnight(contract.startDate) === earliestStart,
  )[0];
}

/** 1 for the creator's first contract, 2 after the first renewal, and so on. */
export function periodNumber(
  contracts: MetricsContract[],
  current: MetricsContract,
): number {
  const start = atMidnight(current.startDate);
  return (
    1 +
    contracts.filter((contract) => atMidnight(contract.startDate) < start)
      .length
  );
}

/** Days left before the contract ends; zero on the final day, negative once it has ended. */
export function daysRemaining(contract: MetricsContract, today: Date): number {
  return Math.round(
    (atMidnight(contract.endDate) - atMidnight(today)) / MS_PER_DAY,
  );
}

export function contentOutcome(
  content: MetricsContent,
  today: Date,
): ContentOutcome {
  const deadline = atMidnight(content.deadline);

  if (content.videoSubmittedAt !== null) {
    return atMidnight(content.videoSubmittedAt) <= deadline
      ? 'on_time'
      : 'submitted_late';
  }

  // The deadline day itself is still open; it only counts as missed once it is behind us.
  return deadline < atMidnight(today) ? 'late' : 'open';
}

function committed(contents: MetricsContent[]): MetricsContent[] {
  return contents.filter((content) => !content.isProposal);
}

export function computeProgress(contents: MetricsContent[]): Progress {
  const owed = committed(contents);
  const submitted = owed.filter(
    (content) => content.videoSubmittedAt !== null,
  ).length;

  return {
    submitted,
    total: owed.length,
    percent:
      owed.length === 0 ? 0 : Math.round((submitted / owed.length) * 100),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function classify(
  onTimeRate: number | null,
  avgRevisions: number,
  hasWork: boolean,
): Performance {
  if (!hasWork) {
    return {
      onTimeRate,
      avgRevisions,
      productivity: 'watch',
      productivityLabel: 'Belum Ada Data',
    };
  }

  if (
    (onTimeRate === null || onTimeRate >= ON_TIME_GOOD) &&
    avgRevisions <= REVISIONS_GOOD
  ) {
    return {
      onTimeRate,
      avgRevisions,
      productivity: 'good',
      productivityLabel: 'Baik',
    };
  }

  if (
    (onTimeRate !== null && onTimeRate < ON_TIME_RISK) ||
    avgRevisions > REVISIONS_RISK
  ) {
    return {
      onTimeRate,
      avgRevisions,
      productivity: 'risk',
      productivityLabel: 'Berisiko',
    };
  }

  return {
    onTimeRate,
    avgRevisions,
    productivity: 'watch',
    productivityLabel: 'Perlu Perhatian',
  };
}

/**
 * Performance over one contract only. Scoping it to a period is what keeps the number
 * actionable: a creator who struggled a year ago but delivers now should read as delivering.
 */
export function computePerformance(
  contract: MetricsContract | null,
  today: Date,
): Performance {
  const contents = contract ? committed(contract.contents) : [];

  const outcomes = contents.map((content) => contentOutcome(content, today));
  const resolved = outcomes.filter((outcome) => outcome !== 'open');
  const onTime = outcomes.filter((outcome) => outcome === 'on_time').length;
  const onTimeRate =
    resolved.length === 0 ? null : Math.round((onTime / resolved.length) * 100);

  const handedIn = contents.filter((content) => content.submissionCount > 0);
  let revisions = 0;
  for (const content of handedIn) revisions += content.submissionCount - 1;
  const avgRevisions =
    handedIn.length === 0 ? 0 : round(revisions / handedIn.length, 2);

  return classify(
    onTimeRate,
    avgRevisions,
    resolved.length > 0 || handedIn.length > 0,
  );
}
