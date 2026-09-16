// How a creator's contract state and performance are worked out.
//
// Everything here is a pure function over plain values: no Prisma types, no database, no
// clock of its own — the caller passes `today` in. That keeps the rules that decide whether
// someone is "Berisiko" readable and testable on their own, and leaves the service with
// nothing but loading rows and handing them over.

export type ContentOutcome = 'on_time' | 'submitted_late' | 'late' | 'open';

export type Productivity = 'good' | 'watch' | 'risk';

export type ProductivityLabel = 'Baik' | 'Perlu Perhatian' | 'Berisiko' | 'Belum Ada Data';

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
  /** Percentage of resolved content delivered by its deadline, or null with nothing resolved. */
  onTimeRate: number | null;
  avgRevisions: number;
  productivity: Productivity;
  productivityLabel: ProductivityLabel;
}

/** At or above this share of on-time deliveries a creator still counts as reliable. */
const ON_TIME_GOOD = 80;
/** Below this share the creator needs attention regardless of revision count. */
const ON_TIME_RISK = 40;
/** Up to this many revisions per content is normal editorial back-and-forth. */
const REVISIONS_GOOD = 1;
/** Above this many the review cycle itself is the problem. */
const REVISIONS_RISK = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC, matching how Postgres `date` columns arrive, so comparisons are day-wise. */
function atMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isContractActive(contract: MetricsContract, today: Date): boolean {
  const now = atMidnight(today);
  return atMidnight(contract.startDate) <= now && now <= atMidnight(contract.endDate);
}

/**
 * The contract the table should describe: the one running today, or failing that the most
 * recently finished one — an expired creator still has to show the terms they just left.
 * A creator whose first contract has not started yet shows that upcoming one instead.
 */
export function currentContract(
  contracts: MetricsContract[],
  today: Date,
): MetricsContract | null {
  if (contracts.length === 0) return null;

  const active = contracts.find((contract) => isContractActive(contract, today));
  if (active) return active;

  const now = atMidnight(today);
  const finished = contracts.filter((contract) => atMidnight(contract.endDate) < now);
  if (finished.length > 0) {
    return finished.reduce((latest, contract) =>
      atMidnight(contract.endDate) > atMidnight(latest.endDate) ? contract : latest,
    );
  }

  return contracts.reduce((earliest, contract) =>
    atMidnight(contract.startDate) < atMidnight(earliest.startDate) ? contract : earliest,
  );
}

/** Days left before the contract ends; negative once it has. Zero on the final day. */
export function daysRemaining(contract: MetricsContract, today: Date): number {
  return Math.round((atMidnight(contract.endDate) - atMidnight(today)) / MS_PER_DAY);
}

export function contentOutcome(content: MetricsContent, today: Date): ContentOutcome {
  const deadline = atMidnight(content.deadline);

  if (content.videoSubmittedAt !== null) {
    return atMidnight(content.videoSubmittedAt) <= deadline ? 'on_time' : 'submitted_late';
  }

  // The deadline day itself is still open: it only counts as missed once it is behind us.
  return deadline < atMidnight(today) ? 'late' : 'open';
}

function committedContents(contents: MetricsContent[]): MetricsContent[] {
  return contents.filter((content) => !content.isProposal);
}

export function computeProgress(contents: MetricsContent[]): Progress {
  const committed = committedContents(contents);
  const submitted = committed.filter((content) => content.videoSubmittedAt !== null).length;

  return {
    submitted,
    total: committed.length,
    percent: committed.length === 0 ? 0 : Math.round((submitted / committed.length) * 100),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function classify(onTimeRate: number | null, avgRevisions: number, hasWork: boolean): Performance {
  if (onTimeRate === null && !hasWork) {
    return {
      onTimeRate,
      avgRevisions,
      productivity: 'watch',
      productivityLabel: 'Belum Ada Data',
    };
  }

  if ((onTimeRate === null || onTimeRate >= ON_TIME_GOOD) && avgRevisions <= REVISIONS_GOOD) {
    return { onTimeRate, avgRevisions, productivity: 'good', productivityLabel: 'Baik' };
  }

  if ((onTimeRate !== null && onTimeRate < ON_TIME_RISK) || avgRevisions > REVISIONS_RISK) {
    return { onTimeRate, avgRevisions, productivity: 'risk', productivityLabel: 'Berisiko' };
  }

  return { onTimeRate, avgRevisions, productivity: 'watch', productivityLabel: 'Perlu Perhatian' };
}

/**
 * Performance over the given contract only. Scoping it to one period is what makes the
 * number actionable: a creator who struggled a year ago but delivers now should read as
 * delivering now.
 */
export function computePerformance(contract: MetricsContract | null, today: Date): Performance {
  const contents = contract ? committedContents(contract.contents) : [];

  const outcomes = contents.map((content) => contentOutcome(content, today));
  const resolved = outcomes.filter((outcome) => outcome !== 'open');
  const onTime = outcomes.filter((outcome) => outcome === 'on_time').length;
  const onTimeRate =
    resolved.length === 0 ? null : Math.round((onTime / resolved.length) * 100);

  const handedIn = contents.filter((content) => content.submissionCount > 0);
  const avgRevisions =
    handedIn.length === 0
      ? 0
      : round(
          handedIn.reduce((total, content) => total + (content.submissionCount - 1), 0) /
            handedIn.length,
          2,
        );

  return classify(onTimeRate, avgRevisions, resolved.length > 0 || handedIn.length > 0);
}
